

# Emily Dashboard — Full Rebuild

## Scope
Complete rewrite of the dashboard and supporting pages. This touches 4 files heavily and creates 2 new ones.

## Architecture

```text
Routes:
  /dashboard        → Dashboard.tsx (Kanban board — rewritten)
  /emilys-brief     → EmilysBrief.tsx (NEW — read-only reference page)
  /calendar         → Calendar toggle handled inside Dashboard.tsx
  /settings         → Existing (unchanged)

Components:
  AppSidebar.tsx    → Redesigned: 60px icon-only, expand on hover
  AdminLayout.tsx   → Update main margin for narrower sidebar
  Dashboard.tsx     → Full rewrite (~1200 lines)
  EmilysBrief.tsx   → New page (~300 lines)
```

## Key Changes from Current Implementation

### 1. Dashboard.tsx — Full Rewrite
The current 1149-line file gets rewritten with these changes:

**Status values updated** — Current code maps statuses like `pending`, `draft`, `in_progress` via `getKanbanColumn()`. New version uses direct DB status values: `queued`, `briefed`, `in_draft`, `pending_review`, `approved`, `scheduled`, `published`. The mapping function simplifies to direct column matching.

**Output type toggles replace channel toggles** — The 3-pill SEO/Blog, Social, Email toggles on each card are replaced with 8 output type pills (SEO Article, Fb/IG, TikTok, Email, SMS, Image, X Post, Reddit). These read/write `mkt_seo_queue.output_types` (text array) via Supabase instead of local state.

**Needs My Action strip** — Updated styling: dark navy background (`#1a1a2e`), white text, amber dot. Clicking filters the board to show only pending_review cards.

**Review view goes full-screen** — Currently opens a Sheet drawer. New version replaces the entire dashboard with a full-screen review layout when triggered. Top bar with back arrow + title. Content rendered as markdown, centred at 720px max-width. If multiple output types exist, show tabs reading from `mkt_job_outputs`. Bottom fixed bar: "Publish Now" (green) and "Schedule" (blue with inline date+time picker). "Request Revision" as muted text link in top bar.

**Brief Emily form** — Updated to include output type grid toggles (2-col on desktop) with descriptions, smart default (FB/IG auto-selects Image Brief), and content type options updated to: Decision Page, AI Article, Regional SEO Page, Social Campaign, Product Guide. Writes `output_types` array on insert.

**Card design** — Priority badge shows "P95" format top-right. Title wraps 2 lines with ellipsis. Output type pills row replaces channel toggles. Pending Review cards get amber background tint `#fffbeb`. Column border colours updated per spec.

**Drag and drop** — Prevent dragging Published cards backward (show tooltip). Status update writes directly to the new status values.

**Ledger tab removed** — The Queue/Ledger tabs are removed. Dashboard is pipeline-only with Calendar toggle.

**Realtime** — Subscribe to both `mkt_seo_queue` and `mkt_job_outputs`. Flash animation on updated cards.

### 2. EmilysBrief.tsx — New Page
Read-only reference page with 4 sections:
- **Core Identity** — Hardcoded prose about Emily's role/voice
- **Output Types** — Visual grid of 8 output type cards with descriptions
- **Active Campaign Briefs** — Hardcoded list with status badges, expandable in Sheet
- **Knowledge Base** — Table of 11 KB documents (hardcoded)

### 3. AppSidebar.tsx — Redesigned
Change from fixed 220px to 60px icon-only sidebar that expands to 200px on hover. Navigation items updated: Dashboard, Calendar, Emily's Brief, Ideas Bucket, Analytics (placeholder), Settings. Uses CSS `group-hover` or state-based width transition.

### 4. AdminLayout.tsx — Margin Update
Update `md:ml-[220px]` to `md:ml-[60px]` to match narrower sidebar.

### 5. App.tsx — Route Addition
Add `/emilys-brief` route pointing to new EmilysBrief page.

## Design System Applied
- Page background: `#f9fafb`
- Cards: white with subtle shadow, 8px radius
- Dark strips: `#1a1a2e`
- Primary blue: `#2563eb`
- System UI font stack (already in place)
- No decorative elements

## Build Sequence
1. Update AppSidebar + AdminLayout (sidebar narrowing)
2. Add EmilysBrief page + route
3. Rewrite Dashboard.tsx: Kanban with new statuses, output type toggles, updated cards
4. Add full-screen Review view inside Dashboard
5. Wire realtime for both tables
6. Mobile responsive: columns stack vertically, Brief Emily full-screen, Review full-screen

## Database Reads
- `mkt_seo_queue` — all columns including `output_types` (text[])
- `mkt_job_outputs` — `job_id`, `output_type`, `content`, `image_url`, `status` (read in Review view)
- Realtime on both tables

