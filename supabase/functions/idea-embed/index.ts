import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { idea_id, title, description, category, priority, submitted_by_email } = await req.json();
    if (!idea_id || !title) {
      return new Response(JSON.stringify({ error: "idea_id and title are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const textToEmbed = `${title}${description ? '. ' + description : ''}`;
    const embedding = await embed(textToEmbed, OPENAI_API_KEY);

    // Store in vector DB so Emily's RAG picks it up
    const { error: vecError } = await supabase.from("mkt_vectordb_documents").insert({
      title: `Idea: ${title}`,
      content: `[Idea] Category: ${category}. Priority: ${priority}. Submitted by: ${submitted_by_email || 'unknown'}. ${description || title}`,
      embedding: JSON.stringify(embedding),
      metadata: {
        type: "idea",
        idea_id,
        category,
        priority,
        submitted_by: submitted_by_email,
      },
    });

    if (vecError) {
      console.error("Vector insert error:", vecError);
      // Non-blocking — continue to similarity search
    }

    // Similarity search against existing documents
    let relatedItems: { id: string; title: string; similarity: number; type: string }[] = [];
    try {
      const { data: matches, error: matchError } = await supabase.rpc("match_mkt_documents", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.72,
        match_count: 6, // extra one since we'll filter self
      });

      if (!matchError && matches) {
        relatedItems = matches
          .filter((m: any) => {
            // Skip the document we just inserted
            const meta = m.metadata;
            if (meta && meta.idea_id === idea_id) return false;
            return true;
          })
          .slice(0, 5)
          .map((m: any) => ({
            id: m.id,
            title: m.title,
            similarity: m.similarity,
            type: m.metadata?.type || "document",
          }));
      }
    } catch (e) {
      console.error("Similarity search failed (non-blocking):", e);
    }

    // Store links in mkt_idea_links
    if (relatedItems.length > 0) {
      const links = relatedItems.map((item) => ({
        idea_id,
        linked_doc_id: item.id,
        linked_idea_id: item.type === "idea" ? (item as any).metadata?.idea_id : null,
        link_type: "similar",
        title: item.title,
        similarity_score: item.similarity,
      }));

      const { error: linkError } = await supabase.from("mkt_idea_links").insert(links);
      if (linkError) console.error("Link insert error:", linkError);
    }

    return new Response(JSON.stringify({
      embedded: !vecError,
      related_count: relatedItems.length,
      related_items: relatedItems,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("idea-embed error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
