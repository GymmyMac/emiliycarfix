// Emily task prompt library.
//
// Each task has a default prompt template (the canonical, working version) and
// an optional override that James can edit from the UI. Overrides are persisted
// to `app_config` (the project-wide KV store) under the key
// `emily_task_prompt:<task_type>` — no new table required.

import { supabase } from '@/lib/supabase';

export type TaskGroup = 'wiki' | 'social' | 'comms' | 'seo' | 'intel';

export interface TaskDefinition {
  type: string;          // unique key, e.g. 'wiki_page'
  group: TaskGroup;
  name: string;
  description: string;
  icon: string;          // emoji
  badgeLabel: 'WIKI' | 'SOCIAL' | 'EMAIL' | 'SEO' | 'INTEL';
  target: string;        // e.g. 'vehicle_generations'
  defaultPrompt: string;
  briefPlaceholder: string;
}

export const TASK_LIBRARY: TaskDefinition[] = [
  // 📄 Wiki
  {
    type: 'wiki_batch',
    group: 'wiki',
    name: 'Generate Wiki Pages',
    description: 'Priority-ordered wiki pages for vehicle_generations',
    icon: '📄',
    badgeLabel: 'WIKI',
    target: 'vehicle_generations',
    defaultPrompt:
      'Generate wiki pages for the next {count} priority vehicles in the queue. Follow the standard VW_<slug> format and write directly to vehicle_generations after sample approval.',
    briefPlaceholder: 'e.g. Generate wiki pages for ranks 21–40',
  },
  {
    type: 'wiki_refresh',
    group: 'wiki',
    name: 'Refresh Existing Page',
    description: 'Rewrite a specific wiki page',
    icon: '🔄',
    badgeLabel: 'WIKI',
    target: 'vehicle_generations',
    defaultPrompt:
      'Rewrite the existing wiki page for {vehicle_slug}. Preserve technical accuracy, improve readability and AEO structure.',
    briefPlaceholder: 'e.g. Refresh the Toyota Aqua NHP10 page',
  },

  // 📱 Social
  {
    type: 'facebook_post',
    group: 'social',
    name: 'Facebook / Instagram Post',
    description: 'Single platform post with Canva brief',
    icon: '📘',
    badgeLabel: 'SOCIAL',
    target: 'mkt_content_queue',
    defaultPrompt:
      'Write a Facebook/Instagram post (≤200 words) for CARFIX about: {topic}. Include a Canva visual brief, a single CTA, and a relevant link to carfix.co.nz.',
    briefPlaceholder: 'e.g. Winter battery check campaign',
  },
  {
    type: 'tiktok_script',
    group: 'social',
    name: 'TikTok Script',
    description: 'Short-form video script',
    icon: '🎵',
    badgeLabel: 'SOCIAL',
    target: 'mkt_content_queue',
    defaultPrompt:
      'Write a 30–45 second TikTok script for CARFIX about: {topic}. Include hook, 3 beats, and on-screen text suggestions.',
    briefPlaceholder: 'e.g. Top 3 WOF fail reasons',
  },
  {
    type: 'linkedin_post',
    group: 'social',
    name: 'LinkedIn Post',
    description: 'B2B / trade audience',
    icon: '💼',
    badgeLabel: 'SOCIAL',
    target: 'mkt_content_queue',
    defaultPrompt:
      'Write a LinkedIn post (≤300 words) for CARFIX targeting workshops and trade buyers about: {topic}. Professional tone, single CTA.',
    briefPlaceholder: 'e.g. New trade pricing tier launch',
  },
  {
    type: 'reddit_post',
    group: 'social',
    name: 'Reddit Post',
    description: 'Community-first, helpful tone',
    icon: '👽',
    badgeLabel: 'SOCIAL',
    target: 'mkt_content_queue',
    defaultPrompt:
      'Write a Reddit post for r/newzealand or r/cars about: {topic}. Helpful, non-promotional, mention CARFIX only as a soft reference.',
    briefPlaceholder: 'e.g. Toyota Aqua battery replacement guide',
  },

  // 📧 Email & SMS
  {
    type: 'email_campaign',
    group: 'comms',
    name: 'Email Campaign',
    description: 'Subject, preview, body for Mailchimp',
    icon: '📧',
    badgeLabel: 'EMAIL',
    target: 'mkt_content_queue',
    defaultPrompt:
      'Write a Mailchimp email campaign for CARFIX about: {topic}. Provide subject line, preview text, and HTML-safe body (≤400 words).',
    briefPlaceholder: 'e.g. April newsletter — winter prep',
  },
  {
    type: 'sms_campaign',
    group: 'comms',
    name: 'SMS Campaign',
    description: 'Under 160 chars, single CTA',
    icon: '💬',
    badgeLabel: 'EMAIL',
    target: 'mkt_content_queue',
    defaultPrompt:
      'Write an SMS for CARFIX (≤160 chars) about: {topic}. One clear CTA with a short link.',
    briefPlaceholder: 'e.g. Flash sale on brake pads',
  },

  // 🔍 SEO
  {
    type: 'seo_decision',
    group: 'seo',
    name: 'Decision Page',
    description: '600–900 word buyer guide',
    icon: '🔍',
    badgeLabel: 'SEO',
    target: 'mkt_seo_queue',
    defaultPrompt:
      'Write a 600–900 word decision/buyer guide page for CARFIX about: {topic}. Comparison table, pros/cons, recommendation.',
    briefPlaceholder: 'e.g. Best battery for Toyota Aqua',
  },
  {
    type: 'seo_aeo',
    group: 'seo',
    name: 'AI-Discoverable Article',
    description: 'AEO-optimised, FAQ format',
    icon: '🤖',
    badgeLabel: 'SEO',
    target: 'mkt_seo_queue',
    defaultPrompt:
      'Write an AEO-optimised article for CARFIX about: {topic}. Use FAQ structure, direct answers in the first 50 words, schema-friendly headings.',
    briefPlaceholder: 'e.g. How long do EV batteries last in NZ?',
  },
  {
    type: 'seo_regional',
    group: 'seo',
    name: 'Regional SEO Page',
    description: 'City-specific landing page',
    icon: '📍',
    badgeLabel: 'SEO',
    target: 'mkt_seo_queue',
    defaultPrompt:
      'Write a city-specific landing page for CARFIX targeting: {city}. Local context, delivery timeframes, relevant common vehicles.',
    briefPlaceholder: 'e.g. CARFIX in Christchurch',
  },

  // 📊 Intelligence
  {
    type: 'intel_competitor',
    group: 'intel',
    name: 'Competitor Snapshot',
    description: "What's changed at Repco / SCA",
    icon: '🕵️',
    badgeLabel: 'INTEL',
    target: 'emily_insights',
    defaultPrompt:
      'Summarise what has changed at Repco, SuperCheap Auto, and Pick-a-Part this month. Highlight pricing moves, new product lines, and SEO shifts.',
    briefPlaceholder: 'e.g. Monthly competitor pulse',
  },
  {
    type: 'intel_keywords',
    group: 'intel',
    name: 'Keyword Opportunity',
    description: 'Surface low-competition gaps',
    icon: '🎯',
    badgeLabel: 'INTEL',
    target: 'emily_insights',
    defaultPrompt:
      'Identify 5–10 low-competition keyword opportunities for CARFIX based on the latest competitor keyword ingestion. Include search volume estimates.',
    briefPlaceholder: 'e.g. Find this month\'s keyword gaps',
  },
  {
    type: 'intel_ga4',
    group: 'intel',
    name: 'GA4 Brief',
    description: 'Summarise recent traffic patterns',
    icon: '📊',
    badgeLabel: 'INTEL',
    target: 'emily_insights',
    defaultPrompt:
      'Summarise carfix.co.nz traffic for the last 7 days from GA4. Top sources, top pages, anomalies, and one recommended action.',
    briefPlaceholder: 'e.g. Weekly GA4 brief',
  },
];

export const TASK_GROUPS: { key: TaskGroup; label: string; icon: string }[] = [
  { key: 'wiki', label: 'Wiki Content', icon: '📄' },
  { key: 'social', label: 'Social', icon: '📱' },
  { key: 'comms', label: 'Email & SMS', icon: '📧' },
  { key: 'seo', label: 'SEO Content', icon: '🔍' },
  { key: 'intel', label: 'Intelligence', icon: '📊' },
];

export const BADGE_COLORS: Record<TaskDefinition['badgeLabel'], string> = {
  WIKI: 'bg-violet-100 text-violet-700',
  SOCIAL: 'bg-blue-100 text-blue-700',
  EMAIL: 'bg-emerald-100 text-emerald-700',
  SEO: 'bg-amber-100 text-amber-700',
  INTEL: 'bg-rose-100 text-rose-700',
};

const cfgKey = (taskType: string) => `emily_task_prompt:${taskType}`;

export async function loadPromptOverride(taskType: string): Promise<string | null> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', cfgKey(taskType))
    .maybeSingle();
  return (data as any)?.value ?? null;
}

export async function loadAllPromptOverrides(): Promise<Record<string, string>> {
  const keys = TASK_LIBRARY.map((t) => cfgKey(t.type));
  const { data } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', keys);
  const out: Record<string, string> = {};
  (data || []).forEach((row: any) => {
    const type = row.key.replace('emily_task_prompt:', '');
    out[type] = row.value;
  });
  return out;
}

export async function savePromptOverride(taskType: string, prompt: string): Promise<void> {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: cfgKey(taskType), value: prompt }, { onConflict: 'key' });
  if (error) throw error;
}

export async function resetPromptOverride(taskType: string): Promise<void> {
  await supabase.from('app_config').delete().eq('key', cfgKey(taskType));
}

export function getTask(type: string): TaskDefinition | undefined {
  return TASK_LIBRARY.find((t) => t.type === type);
}
