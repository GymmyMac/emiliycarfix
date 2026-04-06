import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Eye, Trash2, Send } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ReviewArticle {
  id: string;
  task_id: string | null;
  title: string;
  content_type: string | null;
  psyops_stream: string | null;
  draft_content: string;
  draft_saved_at: string | null;
  notes: string | null;
  slug: string | null;
}

const STREAM_COLORS: Record<string, string> = {
  DISRUPT: 'bg-red-500/15 text-red-400 border-red-500/30',
  EDUCATE: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  CONVERT: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  AMPLIFY: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

function getQualityScore(notes: string | null): number | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (typeof parsed?.content_quality_score === 'number') return parsed.content_quality_score;
  } catch {
    // not JSON
  }
  return null;
}

function formatNZT(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return format(new Date(dateStr), 'd MMM yyyy HH:mm');
  }
}

export default function ReadyToReview() {
  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    const { data } = await supabase
      .from('mkt_seo_queue')
      .select('id, task_id, title, content_type, psyops_stream, draft_content, draft_saved_at, notes, slug')
      .not('draft_content', 'is', null)
      .not('status', 'in', '("published","rejected")')
      .order('draft_saved_at', { ascending: false });

    if (data) setArticles(data);
  }, []);

  useEffect(() => {
    fetchArticles();
    const interval = setInterval(fetchArticles, 60_000);
    return () => clearInterval(interval);
  }, [fetchArticles]);

  const publishArticle = async (article: ReviewArticle) => {
    setPublishing(article.id);
    const { error } = await supabase
      .from('mkt_seo_queue')
      .update({
        status: 'published',
        james_approved: true,
        approved_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
      })
      .eq('id', article.id);

    setPublishing(null);
    if (error) {
      toast.error('Failed to publish — ' + error.message);
    } else {
      setArticles(prev => prev.filter(a => a.id !== article.id));
      toast.success(`✓ Published — ${article.title}`);
    }
  };

  const skipArticle = async (article: ReviewArticle) => {
    const { error } = await supabase
      .from('mkt_seo_queue')
      .update({ status: 'rejected' })
      .eq('id', article.id);

    if (error) {
      toast.error('Failed to skip — ' + error.message);
    } else {
      setArticles(prev => prev.filter(a => a.id !== article.id));
      toast('Skipped — ' + article.title);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Ready to Review</h2>
            {articles.length > 0 && (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
                {articles.length} article{articles.length !== 1 ? 's' : ''} waiting
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Articles Emily has written. Read and publish, or skip.
          </p>
        </div>
      </div>

      {articles.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing ready yet. Emily writes one article every 2 hours on weekdays.
              <br />
              Check back soon — or the next article will appear here automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {articles.map(article => {
            const stream = article.psyops_stream?.toUpperCase() || '';
            const streamClass = STREAM_COLORS[stream] || 'bg-muted text-muted-foreground border-border';
            const quality = getQualityScore(article.notes);
            const isExpanded = expanded[article.id];
            const preview = article.draft_content.slice(0, 300);
            const hasMore = article.draft_content.length > 300;

            return (
              <Card key={article.id} className="overflow-hidden">
                <CardContent className="p-5 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <h3 className="text-base font-semibold text-foreground leading-snug">
                        {article.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {article.content_type && (
                          <Badge variant="outline" className="text-[10px]">
                            {article.content_type}
                          </Badge>
                        )}
                        {stream && (
                          <Badge variant="outline" className={`text-[10px] ${streamClass}`}>
                            {stream}
                          </Badge>
                        )}
                        {quality !== null && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                            Quality: {quality}/10
                          </Badge>
                        )}
                        {article.draft_saved_at && (
                          <span className="text-[11px] text-muted-foreground">
                            Written {formatNZT(article.draft_saved_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => skipArticle(article)}
                      >
                        <Trash2 size={14} className="mr-1" /> Skip
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={publishing === article.id}
                          >
                            <Send size={14} className="mr-1" />
                            {publishing === article.id ? 'Publishing…' : 'Publish'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Publish this article to carfix.co.nz?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{article.title}" will go live immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => publishArticle(article)}
                            >
                              Publish
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Preview / Full content */}
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {isExpanded ? (
                      <ScrollArea className="max-h-[500px] pr-4">
                        <div className="prose prose-sm prose-invert max-w-none">
                          {article.draft_content}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p>{preview}{hasMore ? '…' : ''}</p>
                    )}
                  </div>

                  {hasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-primary"
                      onClick={() => toggleExpand(article.id)}
                    >
                      {isExpanded ? (
                        <><ChevronUp size={14} className="mr-1" /> Collapse</>
                      ) : (
                        <><ChevronDown size={14} className="mr-1" /> Read Full Article</>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
