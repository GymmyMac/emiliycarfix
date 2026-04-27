import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

const SUPABASE_URL = 'https://flpzjbasdsfwoeruyxgp.supabase.co';

export interface EmilyChatRequest {
  message: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  session_id?: string;
}

export interface EmilyChatResponse {
  response: string;
  context_docs?: string[];
}

/**
 * Calls the emily-chat edge function with retry/backoff on transient 5xx errors
 * (including SUPABASE_EDGE_RUNTIME_ERROR cold-starts and provider blips).
 *
 * - Retries 3 times with backoff: 1s -> 2s -> 4s
 * - Only retries on HTTP 5xx and network errors
 * - 4xx (validation, credits, rate-limit-as-422) surface immediately — they're real
 */
export async function callEmilyChat(
  body: EmilyChatRequest,
  opts: { maxAttempts?: number; onRetry?: (attempt: number, reason: string) => void } = {},
): Promise<EmilyChatResponse> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const { data: sess } = await supabase.auth.getSession();
  const jwt = sess?.session?.access_token;

  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/emily-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({} as any));

      // Treat empty response as a failure (model returned nothing) — retryable
      const emptyResponse = res.ok && (!json?.response || String(json.response).trim() === '');

      if (res.ok && !emptyResponse) {
        return json as EmilyChatResponse;
      }

      // 4xx errors are real — don't retry
      if (res.status >= 400 && res.status < 500) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }

      // 5xx OR empty 200 — retryable
      const reason = emptyResponse
        ? 'Emily returned an empty response (model failure)'
        : (json?.message || json?.error || `HTTP ${res.status}`);
      lastErr = new Error(reason);
      console.warn(`[emily-chat] attempt ${attempt}/${maxAttempts} failed:`, res.status, reason);

      if (attempt < maxAttempts) {
        opts.onRetry?.(attempt, reason);
        if (attempt === 1) {
          toast({
            title: "Emily's runtime hiccuped",
            description: 'Retrying automatically…',
          });
        }
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastErr;
    } catch (err: any) {
      // Network-level failure — also retryable
      if (err?.name === 'TypeError' || /network|fetch/i.test(err?.message || '')) {
        lastErr = err;
        console.warn(`[emily-chat] network error attempt ${attempt}/${maxAttempts}:`, err?.message);
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
      throw err;
    }
  }

  throw lastErr || new Error('emily-chat failed after retries');
}

function backoffMs(attempt: number): number {
  return [1000, 2000, 4000][attempt - 1] ?? 4000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
