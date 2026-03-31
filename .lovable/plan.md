
# Emily Dashboard v2.0 — Rebuild Complete

## What Changed

### AppSidebar.tsx — 60px icon-only, expands to 200px on hover
- Nav items: Dashboard, Calendar, Emily's Brief, Ideas, Emily, Analytics, Settings
- Hover-expand with smooth 300ms transition

### AdminLayout.tsx — Updated margin
- `md:ml-[60px]` to match narrow sidebar

### Dashboard.tsx — Full rewrite
- 7 Kanban columns with direct DB status values (queued → published)
- 8 output type pill toggles per card (read/write `output_types` text[])
- Dark navy "Needs My Action" strip with amber dot, click to filter
- Full-screen review view with markdown rendering, output tabs, publish/schedule/revision
- Brief Emily slide-out with 2-col output type grid + smart defaults
- Drag-and-drop with published-card protection
- Realtime subscriptions on `mkt_seo_queue`
- 14-day calendar toggle view
- Priority badge (P95 format), 2-line title clamp, amber tint on pending review

### EmilysBrief.tsx — New page
- Core Identity, Output Types grid, Campaign Briefs, Knowledge Base table
- Read-only reference, brief detail opens in Sheet

### App.tsx — Route added
- `/emilys-brief` → EmilysBrief
