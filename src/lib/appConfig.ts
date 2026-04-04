import { supabase } from './supabase';

/**
 * app_config is a key-value table with columns: key, value, description, updated_at, updated_by
 * This helper reads all rows and maps them into a typed config object.
 */

export interface AppConfig {
  business_phase: string;
  stream_weight_disrupt: number;
  stream_weight_educate: number;
  stream_weight_convert: number;
  stream_weight_amplify: number;
  phase_presets: Record<string, { disrupt: number; educate: number; convert: number; amplify: number }> | null;
}

const CONFIG_KEYS = [
  'business_phase',
  'stream_weight_disrupt',
  'stream_weight_educate',
  'stream_weight_convert',
  'stream_weight_amplify',
  'phase_presets',
];

export async function fetchAppConfig(): Promise<AppConfig | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', CONFIG_KEYS);

  if (error || !data) return null;

  const map: Record<string, string> = {};
  data.forEach((row: { key: string; value: string }) => {
    map[row.key] = row.value;
  });

  return {
    business_phase: map.business_phase || 'load',
    stream_weight_disrupt: parseInt(map.stream_weight_disrupt) || 0,
    stream_weight_educate: parseInt(map.stream_weight_educate) || 0,
    stream_weight_convert: parseInt(map.stream_weight_convert) || 0,
    stream_weight_amplify: parseInt(map.stream_weight_amplify) || 0,
    phase_presets: map.phase_presets ? safeParseJSON(map.phase_presets) : null,
  };
}

function safeParseJSON(str: string): any {
  try { return JSON.parse(str); } catch { return null; }
}

export async function updateAppConfigValue(key: string, value: string): Promise<boolean> {
  const { error } = await supabase
    .from('app_config')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);
  return !error;
}

export async function updateAppConfigValues(entries: { key: string; value: string }[]): Promise<boolean> {
  const results = await Promise.all(
    entries.map(e => updateAppConfigValue(e.key, e.value))
  );
  return results.every(Boolean);
}
