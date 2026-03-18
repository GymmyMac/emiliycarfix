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
    const { idea_id, raw_idea } = await req.json();
    if (!idea_id || !raw_idea) {
      return new Response(JSON.stringify({ error: "idea_id and raw_idea are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const EMILY_OPENROUTER_KEY = Deno.env.get("EMILY_OPENROUTER_KEY");
    if (!EMILY_OPENROUTER_KEY) throw new Error("EMILY_OPENROUTER_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const systemPrompt = `You are Emily, an AI marketing strategist for CARFIX automotive. Your role is to pressure test marketing initiatives before they enter the innovation pipeline.

Evaluate the initiative on these criteria (score each 0-20, total 0-100):
1. Revenue Potential — Will this directly generate or protect revenue?
2. Market Fit — Does this match CARFIX's target customers and positioning?
3. Feasibility — Can this be executed with available resources and time?
4. Differentiation — Does this set CARFIX apart from competitors?
5. Measurability — Can we track clear KPIs and ROI?

Your primary obligation is owner financial return. Every assessment must connect to revenue impact.

Respond with ONLY valid JSON in this exact format:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence assessment explaining the score and key strengths/weaknesses>",
  "recommendation": "<one of: accelerate|maintain|review>"
}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${EMILY_OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": supabaseUrl,
        "X-Title": "CARFIX Emily",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Pressure test this initiative: ${raw_idea}` },
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
      console.error("AI gateway error:", status, errText);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    let parsed: { score: number; summary: string; recommendation: string };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = { score: 50, summary: "Assessment could not be fully parsed. Manual review recommended.", recommendation: "review" };
    }

    // Update the idea record
    const { error: updateError } = await supabase
      .from("mkt_ideas_bucket")
      .update({
        pressure_test_score: parsed.score,
        pressure_test_summary: parsed.summary,
        status: "processed",
      })
      .eq("id", idea_id);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to update idea record");
    }

    return new Response(JSON.stringify({
      score: parsed.score,
      summary: parsed.summary,
      recommendation: parsed.recommendation,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pressure-test error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
