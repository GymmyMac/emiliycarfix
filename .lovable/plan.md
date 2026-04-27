## What's actually happening

The 503 you saw — `{"code":"SUPABASE_EDGE_RUNTIME_ERROR","message":"Service is temporarily unavailable"}` — is **not** from OpenRouter or Claude. It's the **Supabase Edge Runtime itself** failing to boot/serve the function instance (cold start, instance recycle, or a worker that crashed). The browser then sees a blank screen because nothing came back.

This is a well-documented class of problem (see the OpenRouter/Anthropic 5xx retry threads on GitHub). Two distinct failure modes need handling:

1. **Edge runtime 5xx** (503 `SUPABASE_EDGE_RUNTIME_ERROR`, 502, 504) — happens before our code runs. Only the **client** can retry these.
2. **OpenRouter / provider 5xx + empty content** — happens inside the function. The **server** should retry and/or fall back to another model slug.

Right now:
- `wikiBriefWorkflow.ts` already retries 5xx on the client side (good).
- `EmilyAdmin.tsx` (the chat UI, 2 call sites) does **not** retry — it just surfaces the error. That's why "Emily appears broken" pops up so visibly.
- `emily-chat` server-side has **no retry and no model fallback** — one bad OpenRouter response = full failure.

## Engineered solution (the standard pattern others use)

### 1. Server-side: provider fallback + single retry in `emily-chat`

Wrap the OpenRouter call in a small helper that:
- Tries the primary model `anthropic/claude-sonnet-4.5`.
- On 5xx **or** empty content, retries once after 1.5s.
- On second failure, falls back to `anthropic/claude-3.5-sonnet` (still live on OpenRouter), then `anthropic/claude-3-haiku` as a last resort for chat continuity.
- Also pass OpenRouter's built-in `provider: { order: [...], allow_fallbacks: true }` so OpenRouter routes around a sick upstream provider automatically — this is the documented OpenRouter mitigation for provider 5xx.

Returns a clear error only if **all** attempts fail, so we don't silently waste credits on dead providers.

### 2. Client-side: shared retry wrapper for chat invocations

Add a tiny `callEmilyChat()` helper (in `src/lib/emilyChat.ts`) that the two `EmilyAdmin.tsx` call sites use. It:
- Retries up to 3 times on HTTP 5xx (including 503 `SUPABASE_EDGE_RUNTIME_ERROR`) with backoff 1s → 2s → 4s.
- Does **not** retry 4xx (bad request, rate-limit-as-422, credits exhausted) — those are real and should surface.
- Surfaces a friendly toast like "Emily's runtime hiccuped — retrying…" on the first retry so you see it's working, not frozen.

This matches what tools like `opencode` and OpenRouter's own SDK do for the exact same error class.

### 3. Quick observability

Add one console.warn line per retry so the next time it happens we can see in the browser console whether the failure was edge-runtime or model-side.

## Files to change

- `supabase/functions/emily-chat/index.ts` — add `callOpenRouterWithFallback()` (3 model slugs, 1 retry per slug, OpenRouter `provider.allow_fallbacks` flag).
- `src/lib/emilyChat.ts` — **new** small shared helper with retry/backoff for invoking `emily-chat`.
- `src/pages/EmilyAdmin.tsx` — replace the two inline `fetch(.../emily-chat)` blocks with `callEmilyChat(...)`.

No DB changes, no schema changes, no new secrets. The existing `EMILY_OPENROUTER_KEY` covers all three fallback model slugs.

## Why not just "switch model again"?

That's what we did last time and it kept happening because the failure mode shifted from "deprecated slug" to "edge runtime cold-start" — different root cause, same symptom. A proper retry+fallback layer fixes both, and any future variant of the same class of problem.