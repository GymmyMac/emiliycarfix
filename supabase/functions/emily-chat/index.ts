import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const EMILY_OPENROUTER_KEY = Deno.env.get("EMILY_OPENROUTER_KEY");
    if (!EMILY_OPENROUTER_KEY) throw new Error("EMILY_OPENROUTER_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recent conversation history for context
    let conversationHistory: { role: string; content: string }[] = [];
    if (session_id) {
      const { data: history } = await supabase
        .from("mkt_emily_conversations")
        .select("user_message, emily_response")
        .eq("session_id", session_id)
        .not("emily_response", "is", null)
        .order("created_at", { ascending: true })
        .limit(10);

      if (history) {
        conversationHistory = history.flatMap((row) => [
          { role: "user", content: row.user_message },
          { role: "assistant", content: row.emily_response },
        ]);
      }
    }

    const systemPrompt = `You are Emily, the AI marketing strategist for CARFIX automotive. You have deep knowledge of automotive aftermarket marketing, customer psychology, and the PSYOPS content framework.

Your role:
- Advise on marketing strategy, content creation, and campaign planning
- Analyze performance data and suggest optimizations
- Generate social media posts, email copy, and campaign ideas
- Pressure test ideas before they enter the pipeline
- Always connect recommendations back to revenue impact

Tone: Direct, strategic, data-informed. You're a trusted CMO-level advisor, not a generic chatbot.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${EMILY_OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": supabaseUrl,
        "X-Title": "CARFIX Emily",
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "OpenRouter credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("OpenRouter error:", status, errText);
      throw new Error(`OpenRouter error: ${status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const contextDocs: string[] = [];

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
