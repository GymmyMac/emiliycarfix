import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FileText, Zap, Target, Users, Megaphone, PenTool, Image, Mail, MessageSquare, Twitter, BookOpen } from 'lucide-react';

/* ── Output Types ── */
const OUTPUT_TYPES = [
  { icon: '📄', name: 'SEO Article', desc: 'Long-form guide, 600–900 words, optimised for search and AI citation', skill: 'seo_article_skill.md' },
  { icon: '📱', name: 'Facebook / Instagram', desc: 'Facebook post (100–150 words) + Instagram caption (50–80 words)', skill: 'social_skill.md' },
  { icon: '🎬', name: 'TikTok Script', desc: '60–90 second spoken video script. One product, one result.', skill: 'tiktok_skill.md' },
  { icon: '📧', name: 'Email', desc: 'Subject line + preview text + campaign body. Mailchimp-ready.', skill: 'email_skill.md' },
  { icon: '💬', name: 'SMS', desc: 'Under 160 characters. Urgency or offer driven.', skill: 'sms_skill.md' },
  { icon: '🖼️', name: 'Image Brief', desc: 'Ideogram prompt for a matched visual — square for social, landscape for article.', skill: 'image_brief_skill.md' },
  { icon: '🐦', name: 'X / Twitter Post', desc: 'Under 280 characters. Deal alert or quick tip.', skill: 'x_post_skill.md' },
  { icon: '📝', name: 'Reddit Thread', desc: '200–400 word DIY thread. Community-first.', skill: 'reddit_skill.md' },
];

/* ── Campaign Briefs ── */
const CAMPAIGN_BRIEFS = [
  { id: 'CB-001', name: 'Winter Brake Safety Campaign', duration: '1 Jun – 31 Aug 2026', status: 'active' as const, content: 'Focus on wet-weather braking performance. Target keywords around brake pad replacement, disc rotor wear, and stopping distances. Regional angle: NZ winter driving conditions.' },
  { id: 'CB-002', name: 'Oil & Filter Change Awareness', duration: '1 Apr – 30 Jun 2026', status: 'active' as const, content: 'Promote regular oil changes for engine longevity. Push decision pages for oil filter selection and synthetic vs conventional oil.' },
  { id: 'CB-003', name: 'Summer Road Trip Prep', duration: '1 Nov – 31 Dec 2025', status: 'complete' as const, content: 'Seasonal campaign covering cooling system checks, tyre condition, and WOF preparation for summer travel.' },
];

/* ── Knowledge Base ── */
const KB_DOCS = [
  { file: 'EMILY_MASTER_BRIEF.md', contains: 'Core identity, brand voice, tone rules, output specs', usage: 'Every generation — sets personality and constraints' },
  { file: 'CARFIX_PRODUCT_CATALOGUE.md', contains: 'Full product range with SKUs, prices, fitment data', usage: 'Product mentions, pricing, cross-sells' },
  { file: 'NZ_AUTOMOTIVE_TERMS.md', contains: 'NZ-specific terminology and spelling preferences', usage: 'Localisation of all content' },
  { file: 'SEO_KEYWORD_MAP.md', contains: 'Target keywords by category with search volume and difficulty', usage: 'SEO article planning and optimisation' },
  { file: 'COMPETITOR_LANDSCAPE.md', contains: 'Key competitors, their positioning, content gaps', usage: 'Differentiation and competitive hooks' },
  { file: 'BRAND_GUIDELINES.md', contains: 'Logo usage, colour palette, photography style', usage: 'Image briefs and social content' },
  { file: 'CUSTOMER_PERSONAS.md', contains: '4 core customer personas with demographics and pain points', usage: 'Audience targeting and tone adjustment' },
  { file: 'EMAIL_TEMPLATES.md', contains: 'Mailchimp template structure, merge tags, best practices', usage: 'Email output formatting' },
  { file: 'SOCIAL_CALENDAR_RULES.md', contains: 'Posting frequency, platform rules, hashtag strategy', usage: 'Social content scheduling' },
  { file: 'CONTENT_STYLE_GUIDE.md', contains: 'Heading structure, CTA patterns, internal linking rules', usage: 'Article and page formatting' },
  { file: 'REGIONAL_SEO_TEMPLATE.md', contains: 'City/region page template with local signals', usage: 'Regional SEO page generation' },
];

const STATUS_STYLES = {
  active: 'bg-green-500/15 text-green-600 border-green-500/30',
  draft: 'bg-muted/20 text-muted-foreground border-border',
  complete: 'bg-foreground/10 text-foreground/60 border-foreground/20',
};

export default function EmilysBrief() {
  const [selectedBrief, setSelectedBrief] = useState<typeof CAMPAIGN_BRIEFS[0] | null>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-foreground">Emily's Brief</h1>
        <p className="text-sm text-muted-foreground mt-1">What Emily knows and what she's currently working to</p>
      </div>

      {/* Section 1 — Core Identity */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display text-lg text-foreground">Who Emily Is</h2>
          <div className="prose prose-sm max-w-none text-foreground/80 space-y-3">
            <p>
              Emily is CARFIX's AI marketing engine — a specialist content strategist who produces high-quality
              automotive aftermarket content for the New Zealand market. She writes in a confident, knowledgeable
              tone that positions CARFIX as the trusted authority on car parts and maintenance.
            </p>
            <p>
              <strong>Voice:</strong> Professional but approachable. Technical accuracy without jargon overload.
              Always NZ-localised — uses "bonnet" not "hood", "tyre" not "tire", "$NZD" pricing.
              Emily never fabricates specifications or fitment data — she references the product catalogue.
            </p>
            <p>
              <strong>Mission:</strong> Drive organic traffic through search-optimised content, build brand authority
              in the NZ automotive aftermarket, and convert readers into customers through strategic CTAs and
              product recommendations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Output Types */}
      <div>
        <h2 className="font-display text-lg text-foreground mb-4">Output Types Available</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {OUTPUT_TYPES.map((ot) => (
            <Card key={ot.name} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-2">
                <div className="text-2xl">{ot.icon}</div>
                <h3 className="text-sm font-semibold text-foreground">{ot.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{ot.desc}</p>
                <p className="text-[10px] text-muted-foreground/60">Skill file: {ot.skill}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section 3 — Active Campaign Briefs */}
      <div>
        <h2 className="font-display text-lg text-foreground mb-4">Active Campaign Briefs</h2>
        <div className="space-y-2">
          {CAMPAIGN_BRIEFS.map((brief) => (
            <Card key={brief.id} className="rounded-xl shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{brief.id}</span>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLES[brief.status]}`}>
                      {brief.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{brief.name}</h3>
                  <p className="text-xs text-muted-foreground">{brief.duration}</p>
                </div>
                <button
                  onClick={() => setSelectedBrief(brief)}
                  className="text-xs text-primary font-medium hover:underline shrink-0"
                >
                  View Brief
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section 4 — Knowledge Base */}
      <div>
        <h2 className="font-display text-lg text-foreground mb-4">Knowledge Base</h2>
        <Card className="rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/5">
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">File</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground hidden md:table-cell">Contains</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground hidden lg:table-cell">When Emily Uses It</th>
                </tr>
              </thead>
              <tbody>
                {KB_DOCS.map((doc) => (
                  <tr key={doc.file} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{doc.file}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{doc.contains}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">{doc.usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Brief Detail Sheet */}
      <Sheet open={!!selectedBrief} onOpenChange={(open) => !open && setSelectedBrief(null)}>
        <SheetContent className="w-full sm:w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selectedBrief && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{selectedBrief.id}</span>
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLES[selectedBrief.status]}`}>
                    {selectedBrief.status}
                  </span>
                </div>
                <SheetTitle className="text-lg font-bold text-foreground text-left">{selectedBrief.name}</SheetTitle>
                <p className="text-xs text-muted-foreground">{selectedBrief.duration}</p>
              </SheetHeader>
              <div className="prose prose-sm max-w-none text-foreground/80">
                <p>{selectedBrief.content}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
