import { supabase } from '@/lib/supabase';

const SUPABASE_URL = 'https://flpzjbasdsfwoeruyxgp.supabase.co';

// ---------- Global stop flag ----------
// Lets the UI halt long-running batch loops between vehicle iterations
// without having to wire AbortControllers through every call.
let _stopRequested = false;
export function requestStop() { _stopRequested = true; }
export function clearStop() { _stopRequested = false; }
export function isStopRequested() { return _stopRequested; }
export class WikiStoppedError extends Error {
  constructor() { super('Stopped by user'); this.name = 'WikiStoppedError'; }
}

export interface PriorityVehicle {
  id: string;
  slug: string;
  make: string;
  model: string;
  generation: string;
  years_start: number;
  years_end: number | null;
  estimated_nz_owners?: number | null;
  rank?: number | null;
}

export interface ParsedWiki {
  seo_title?: string;
  seo_description?: string;
  aeo_intro?: string;
  aeo_body?: string;
  aeo_context?: string | null;
  common_issues?: string;
  wof_notes?: string;
  service_interval_km?: number | null;
}

export interface SamplePreview {
  vehicle: PriorityVehicle;
  wiki: ParsedWiki;
  raw: string;
}

/** Detects whether a user message is a "wiki brief" that should trigger the
 *  Sample → Approve → Execute workflow rather than the standard Emily round-trip. */
export function detectWikiBrief(message: string): { matched: boolean; batchLimit: number } {
  const text = message.toLowerCase();
  const mentionsWiki = /\bwiki\b/.test(text) && /\b(generate|write|create|build|do|run|make|produce)\b/.test(text);
  const mentionsVehicleWiki = /vehicle\s+wiki/.test(text);
  const mentionsRanks = /\branks?\b\s*\d+\s*[-–to]+\s*\d+/.test(text);
  if (!mentionsWiki && !mentionsVehicleWiki && !mentionsRanks) return { matched: false, batchLimit: 0 };

  let limit = 25;
  const rangeMatch = text.match(/ranks?\s*(\d+)\s*[-–to]+\s*(\d+)/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1], 10);
    const b = parseInt(rangeMatch[2], 10);
    limit = Math.max(1, Math.abs(b - a) + 1);
  } else {
    const nMatch = text.match(/\b(\d{1,3})\s*(?:wiki|pages?|vehicles?)/);
    if (nMatch) limit = Math.max(1, parseInt(nMatch[1], 10));
  }
  return { matched: true, batchLimit: Math.min(limit, 100) };
}

export async function fetchPriorityVehicles(batchLimit: number): Promise<PriorityVehicle[]> {
  const { data, error } = await supabase.rpc('get_vehiclewiki_priority_queue', { batch_limit: batchLimit });
  if (error) throw error;
  return (data as PriorityVehicle[]) || [];
}

/** Robust JSON extractor — handles raw JSON, ```json blocks, plain ``` blocks,
 *  and balanced first-{...} extraction with depth tracking. */
export function extractJSON(text: string): ParsedWiki | null {
  if (!text?.trim()) return null;

  // 1. Direct parse
  try { return JSON.parse(text.trim()); } catch { /* continue */ }

  // 2. ```json ... ``` block
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }

  // 3. Any ``` ... ``` block
  const anyFence = text.match(/```\s*([\s\S]*?)```/);
  if (anyFence) {
    try { return JSON.parse(anyFence[1].trim()); } catch { /* continue */ }
  }

  // 4. Balanced first {...} object
  const start = text.indexOf('{');
  if (start !== -1) {
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fallthrough */ }
    }
  }

  return null;
}

function buildTaskMessage(vehicle: PriorityVehicle): string {
  const years = `${vehicle.years_start}–${vehicle.years_end ?? 'onwards'}`;
  return `VW_${vehicle.slug} (ID: ${vehicle.id}, Make: ${vehicle.make}, Model: ${vehicle.model}, Generation: ${vehicle.generation}, Years: ${years})`;
}

async function callEmilyForVehicle(vehicle: PriorityVehicle): Promise<string> {
  const taskMessage = buildTaskMessage(vehicle);
  const { data: sess } = await supabase.auth.getSession();
  const jwt = sess?.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/emily-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify({
      message: taskMessage,
      messages: [{ role: 'user', content: taskMessage }],
      session_id: `admin-wiki-${vehicle.slug}-${Date.now()}`,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Emily request failed (${res.status})`);
  return json?.response || '';
}

export async function generateSampleForVehicle(vehicle: PriorityVehicle): Promise<SamplePreview> {
  const raw = await callEmilyForVehicle(vehicle);
  const wiki = extractJSON(raw);
  if (!wiki?.aeo_intro) {
    throw new Error('Emily did not return parseable wiki content for this vehicle.');
  }
  return { vehicle, wiki, raw };
}

export type DeployStatus = 'live' | 'skipped' | 'failed';

export interface DeployResult {
  vehicleId: string;
  slug: string;
  make: string;
  model: string;
  generation: string;
  status: DeployStatus;
  reason?: string;
  raw?: string;
}

/** Writes a parsed wiki object to vehicle_generations via the deploy-wiki-page
 *  edge function (service-role server-side write — frontend anon key cannot
 *  UPDATE this table because no UPDATE RLS policy exists). */
export async function writeWikiToDb(
  vehicle: PriorityVehicle,
  wiki: ParsedWiki,
  raw?: string,
): Promise<DeployResult> {
  const base = {
    vehicleId: vehicle.id,
    slug: vehicle.slug,
    make: vehicle.make,
    model: vehicle.model,
    generation: vehicle.generation,
    raw,
  };

  try {
    const { data, error } = await supabase.functions.invoke('deploy-wiki-page', {
      body: { vehicle_id: vehicle.id, wiki_content: wiki },
    });

    if (error) {
      return { ...base, status: 'failed', reason: `deploy invoke error: ${error.message}` };
    }
    if (data?.skipped) {
      return { ...base, status: 'skipped', reason: data.reason || 'already had content' };
    }
    if (!data?.success) {
      return { ...base, status: 'failed', reason: data?.error || 'deploy failed' };
    }
    return { ...base, status: 'live' };
  } catch (e: any) {
    return { ...base, status: 'failed', reason: `deploy error: ${e?.message || 'unknown'}` };
  }
}

export async function deployVehicle(vehicle: PriorityVehicle): Promise<DeployResult> {
  const base = {
    vehicleId: vehicle.id,
    slug: vehicle.slug,
    make: vehicle.make,
    model: vehicle.model,
    generation: vehicle.generation,
  };

  let raw = '';
  try {
    raw = await callEmilyForVehicle(vehicle);
  } catch (e: any) {
    return { ...base, status: 'failed', reason: `emily-chat error: ${e?.message || 'unknown'}`, raw: '' };
  }

  const wiki = extractJSON(raw);
  if (!wiki?.aeo_intro) {
    return { ...base, status: 'failed', reason: 'no valid JSON returned', raw };
  }

  return await writeWikiToDb(vehicle, wiki, raw);
}
