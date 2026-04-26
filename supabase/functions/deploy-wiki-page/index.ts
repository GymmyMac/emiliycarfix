// supabase/functions/deploy-wiki-page/index.ts
// Server-side wiki content deploy. Bypasses RLS via service role key.
// Frontend anon key cannot UPDATE vehicle_generations (no UPDATE policy exists),
// so deploys must be routed through this function.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { vehicle_id, wiki_content } = await req.json();

    if (!vehicle_id || !wiki_content?.aeo_intro) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing vehicle_id or aeo_intro",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Safety: skip if already populated.
    const { data: existing, error: readErr } = await supabase
      .from("vehicle_generations")
      .select("aeo_intro, slug")
      .eq("id", vehicle_id)
      .single();

    if (readErr) {
      return new Response(
        JSON.stringify({ success: false, error: `read error: ${readErr.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (existing?.aeo_intro) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: "already has content",
          slug: existing.slug,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error } = await supabase
      .from("vehicle_generations")
      .update({
        seo_title: wiki_content.seo_title,
        seo_description: wiki_content.seo_description,
        aeo_intro: wiki_content.aeo_intro,
        aeo_body: wiki_content.aeo_body,
        aeo_context: wiki_content.aeo_context ?? null,
        common_issues: wiki_content.common_issues,
        wof_notes: wiki_content.wof_notes,
        service_interval_km: wiki_content.service_interval_km ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vehicle_id);

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, slug: existing?.slug }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
