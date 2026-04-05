import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { youtube_id } = await req.json();
    if (!youtube_id || typeof youtube_id !== 'string') {
      return new Response(JSON.stringify({ error: 'youtube_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch video details
    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${youtube_id}&key=${apiKey}`;
    const videoRes = await fetch(videoUrl);
    const videoData = await videoRes.json();

    if (!videoData.items || videoData.items.length === 0) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const item = videoData.items[0];
    const snippet = item.snippet;
    const stats = item.statistics;
    const content = item.contentDetails;

    // Parse ISO 8601 duration (PT#H#M#S)
    const durationMatch = (content.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const durationSeconds = durationMatch
      ? (parseInt(durationMatch[1] || '0') * 3600) +
        (parseInt(durationMatch[2] || '0') * 60) +
        parseInt(durationMatch[3] || '0')
      : 0;

    // Fetch channel subscriber count
    let channelSubscriberCount = 0;
    if (snippet.channelId) {
      const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${snippet.channelId}&key=${apiKey}`;
      const channelRes = await fetch(channelUrl);
      const channelData = await channelRes.json();
      if (channelData.items?.[0]?.statistics?.subscriberCount) {
        channelSubscriberCount = parseInt(channelData.items[0].statistics.subscriberCount);
      }
    }

    // Check if already exists in DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from('youtube_videos')
      .select('id')
      .eq('youtube_id', youtube_id)
      .maybeSingle();

    const result = {
      youtube_id,
      title: snippet.title,
      description: snippet.description,
      channel_id: snippet.channelId,
      channel_name: snippet.channelTitle,
      channel_subscriber_count: channelSubscriberCount,
      duration_seconds: durationSeconds,
      published_at: snippet.publishedAt,
      thumbnail_url: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
      view_count: parseInt(stats.viewCount || '0'),
      like_count: parseInt(stats.likeCount || '0'),
      comment_count: parseInt(stats.commentCount || '0'),
      already_exists: !!existing,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('youtube-fetch-single error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
