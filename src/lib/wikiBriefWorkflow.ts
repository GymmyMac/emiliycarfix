import { supabase } from '@/lib/supabase';

const SUPABASE_URL = 'https://flpzjbasdsfwoeruyxgp.supabase.co';

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

  // Batch size detection
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

function parseWikiJson(raw: string): ParsedWiki | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/);
    if (fenced) {
      try { return JSON.parse(fenced[1].trim()); } catch { /* fallthrough */ }
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); } catch { /* nope */ }
    }
  }
  return null;
}

async function callEmilyForVehicle(vehicle: PriorityVehicle): Promise<string> {
  const years = `${vehicle.years_start}–${vehicle.years_end ?? 'onwards'}`;
  const taskMessage = `VW_${vehicle.slug} (ID: ${vehicle.id}, Make: ${vehicle.make}, Model: ${vehicle.model}, Generation: ${vehicle.generation}, Years: ${years})`;

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
  const wiki = parseWikiJson(raw);
  if (!wiki?.aeo_intro) {
    throw new Error('Emily did not return parseable wiki content for this vehicle.');
  }
  return { vehicle, wiki, raw };
}

export interface DeployResult {
  slug: string;
  make: string;
  model: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

/** Writes a parsed wiki object to vehicle_generations with a safety check
 *  that prevents overwriting a row that already has content. */
export async function writeWikiToDb(vehicle: PriorityVehicle, wiki: ParsedWiki): Promise<DeployResult> {
  const { data, error } = await supabase
    .from('vehicle_generations')
    .update({
      seo_title: wiki.seo_title,
      seo_description: wiki.seo_description,
      aeo_intro: wiki.aeo_intro,
      aeo_body: wiki.aeo_body,
      aeo_context: wiki.aeo_context ?? null,
      common_issues: wiki.common_issues,
      wof_notes: wiki.wof_notes,
      service_interval_km: wiki.service_interval_km,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vehicle.id)
    .is('aeo_intro', null)
    .select('id');

  if (error) return { slug: vehicle.slug, make: vehicle.make, model: vehicle.model, success: false, error: error.message };
  if (!data || data.length === 0) return { slug: vehicle.slug, make: vehicle.make, model: vehicle.model, success: false, skipped: true };
  return { slug: vehicle.slug, make: vehicle.make, model: vehicle.model, success: true };
}

export async function deployVehicle(vehicle: PriorityVehicle): Promise<DeployResult> {
  try {
    const raw = await callEmilyForVehicle(vehicle);
    const wiki = parseWikiJson(raw);
    if (!wiki?.aeo_intro) {
      return { slug: vehicle.slug, make: vehicle.make, model: vehicle.model, success: false, error: 'Unparseable response' };
    }
    return await writeWikiToDb(vehicle, wiki);
  } catch (e: any) {
    return { slug: vehicle.slug, make: vehicle.make, model: vehicle.model, success: false, error: e?.message || 'Unknown error' };
  }
}
