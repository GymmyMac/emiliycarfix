import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Generate a 1536-dim embedding via OpenAI text-embedding-3-small */
async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("OpenAI embedding error:", res.status, err);
    throw new Error(`Embedding error: ${res.status}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

function truncateText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n…[truncated]`;
}

// emily-chat v2 — model fallback chain + empty-content guard (redeploy marker)
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, session_id } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedMessage = String(message).trim();
    const isOversizedRequest = normalizedMessage.length > 3500 || /prioritis(e|z)\s+in\s+this\s+order|high\s+—|medium\s+—|surface each page as a pending action/i.test(normalizedMessage);
    if (isOversizedRequest) {
      return new Response(JSON.stringify({
        error: "This request is too large for a single Emily chat run. Send 2–3 vehicles per message and Emily will handle them in batches without timing out.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const EMILY_OPENROUTER_KEY = Deno.env.get("EMILY_OPENROUTER_KEY");
    if (!EMILY_OPENROUTER_KEY) throw new Error("EMILY_OPENROUTER_KEY is not configured");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- 1. VECTOR MEMORY: Retrieve relevant docs ---
    let contextChunks: { title: string; content: string; similarity: number }[] = [];
    let contextDocs: string[] = [];
    try {
      const queryEmbedding = await embed(message, OPENAI_API_KEY);
      const { data: matches, error: matchError } = await supabase.rpc("match_mkt_documents", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.72,
        match_count: 5,
      });
      if (matchError) {
        console.error("Vector search error:", matchError);
      } else if (matches && matches.length > 0) {
        // Cap each chunk to keep total context well under the 200k token model limit.
        // Some mkt_documents rows hold huge blobs (>500k chars) which blew past the limit.
        const MAX_CHARS_PER_CHUNK = 4000;
        contextChunks = matches.map((m: any) => ({
          title: m.title,
          content: truncateText(m.content, MAX_CHARS_PER_CHUNK),
          similarity: m.similarity,
        }));
        // Deduplicate titles for the UI pills
        contextDocs = [...new Set(contextChunks.map((c) => c.title))];
      }
    } catch (vecErr) {
      console.error("Vector retrieval failed (non-blocking):", vecErr);
    }

    // --- 1b. IDEAS AWARENESS ---
    let ideasContext = "";
    try {
      const { data: recentIdeas } = await supabase
        .from("mkt_ideas")
        .select("id, title, category, priority, status, submitted_by_email, created_at")
        .order("created_at", { ascending: false })
        .limit(15);

      if (recentIdeas && recentIdeas.length > 0) {
        const ideasBlock = recentIdeas
          .map((idea: any) => `- [${idea.status.toUpperCase()}] "${idea.title}" (${idea.category}, ${idea.priority} priority, by ${idea.submitted_by_email || 'unknown'}, ${idea.created_at})`)
          .join("\n");
        ideasContext = `\n\n## Ideas in the System\nYou have passive awareness of these ideas stored in the Ideas system. If the conversation topic relates to any of them, you can naturally reference them — e.g. "You have an idea in the system related to this — want me to pull it up?"\n\n${ideasBlock}`;
      }
    } catch (ideasErr) {
      console.error("Ideas fetch failed (non-blocking):", ideasErr);
    }

    // --- 2. CONVERSATION HISTORY ---
    let conversationHistory: { role: string; content: string }[] = [];
    if (session_id) {
      const { data: history } = await supabase
        .from("mkt_emily_conversations")
        .select("user_message, emily_response")
        .eq("session_id", session_id)
        .not("emily_response", "is", null)
        .order("created_at", { ascending: true })
        .limit(20);

      if (history) {
        const MAX_HISTORY_TURNS = 6;
        const MAX_CHARS_PER_HISTORY_MESSAGE = 3000;
        conversationHistory = history
          .slice(-MAX_HISTORY_TURNS)
          .flatMap((row) => {
            const messages = [] as { role: string; content: string }[];
            const userMessage = truncateText(row.user_message, MAX_CHARS_PER_HISTORY_MESSAGE);
            const assistantMessage = truncateText(row.emily_response, MAX_CHARS_PER_HISTORY_MESSAGE);
            if (userMessage) messages.push({ role: "user", content: userMessage });
            if (assistantMessage) messages.push({ role: "assistant", content: assistantMessage });
            return messages;
          });
      }
    }

    // --- 3. BUILD SYSTEM PROMPT WITH CONTEXT ---
    let systemPrompt = `You are Emily, the AI marketing strategist for CARFIX automotive. You have deep knowledge of automotive aftermarket marketing, customer psychology, and the PSYOPS content framework.

Your role:
- Advise on marketing strategy, content creation, and campaign planning
- Analyze performance data and suggest optimizations
- Generate social media posts, email copy, and campaign ideas
- Pressure test ideas before they enter the pipeline
- Always connect recommendations back to revenue impact

Tone: Direct, strategic, data-informed. You're a trusted CMO-level advisor, not a generic chatbot.`;

    if (contextChunks.length > 0) {
      const contextBlock = contextChunks
        .map((c, i) => `[${i + 1}] ${c.title} (relevance: ${(c.similarity * 100).toFixed(0)}%)\n${c.content}`)
        .join("\n\n---\n\n");
      systemPrompt += `\n\n## Retrieved Knowledge\nThe following documents from your CARFIX knowledge base are relevant to this query. Use them to inform your response. Reference specific documents when applicable.\n\n${contextBlock}`;
    }

    // Append ideas awareness
    if (ideasContext) {
      systemPrompt += ideasContext;
    }

    const MAX_SYSTEM_PROMPT_CHARS = 60000;
    if (systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
      console.warn(`emily-chat system prompt trimmed from ${systemPrompt.length} to ${MAX_SYSTEM_PROMPT_CHARS} chars`);
      systemPrompt = `${systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS)}\n\n…[system prompt truncated]`;
    }

    // --- 4. CALL OPENROUTER with model fallback chain + per-model retry ---
    // Failure modes covered:
    //   - Provider 5xx (Anthropic upstream blip)  -> retry once, then next model
    //   - Empty content (deprecated/rejected slug) -> next model
    //   - Rate limit (429) / credits (402)        -> surface immediately
    //   - Hard timeout (120s)                     -> surface as 504
    const MODEL_FALLBACKS = [
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-haiku",
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    async function tryModel(modelSlug: string): Promise<{ ok: true; content: string } | { ok: false; status: number; reason: string; fatal: boolean }> {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${EMILY_OPENROUTER_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": supabaseUrl,
            "X-Title": "CARFIX Emily",
          },
          body: JSON.stringify({
            model: modelSlug,
            max_tokens: 4096,
            // Let OpenRouter route around a sick upstream provider automatically.
            provider: { allow_fallbacks: true },
            messages: [
              { role: "system", content: systemPrompt },
              ...conversationHistory,
              { role: "user", content: message },
            ],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          // 4xx (rate limit / credits / bad request) — fatal, do not try other models.
          const fatal = response.status === 429 || response.status === 402 || (response.status >= 400 && response.status < 500);
          console.error(`OpenRouter ${modelSlug} -> ${response.status}: ${errText}`);
          return { ok: false, status: response.status, reason: errText, fatal };
        }

        const aiData = await response.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        if (!content) {
          console.warn(`OpenRouter ${modelSlug} returned empty content. Payload:`, JSON.stringify(aiData).slice(0, 400));
          return { ok: false, status: 502, reason: "empty_content", fatal: false };
        }
        return { ok: true, content };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        console.warn(`OpenRouter ${modelSlug} threw:`, err);
        return { ok: false, status: 500, reason: (err as Error)?.message || "network", fatal: false };
      }
    }

    let content = "";
    let lastFailure: { status: number; reason: string } | null = null;

    try {
      outer: for (const slug of MODEL_FALLBACKS) {
        // Up to 2 attempts per slug (handles transient provider 5xx).
        for (let attempt = 1; attempt <= 2; attempt++) {
          const result = await tryModel(slug);
          if (result.ok) {
            content = result.content;
            if (slug !== MODEL_FALLBACKS[0]) console.warn(`emily-chat: served via fallback model ${slug}`);
            break outer;
          }
          lastFailure = { status: result.status, reason: result.reason };
          if (result.fatal) {
            // Don't waste credits on fallbacks for 4xx — surface now.
            clearTimeout(timeoutId);
            if (result.status === 429) {
              return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
                status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            if (result.status === 402) {
              return new Response(JSON.stringify({ error: "OpenRouter credits exhausted." }), {
                status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            throw new Error(`OpenRouter ${result.status}: ${result.reason}`);
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        return new Response(JSON.stringify({
          error: "Emily took too long to respond. For large multi-item requests, break into batches of 2–3 items.",
        }), { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!content) {
      return new Response(JSON.stringify({
        error: `Emily's models all failed. Last error: ${lastFailure?.status ?? "?"} ${(lastFailure?.reason || "").slice(0, 300)}`,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ response: content, context_docs: contextDocs }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("emily-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
