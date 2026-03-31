

# Emily Dashboard Redesign — Kanban Pipeline Board

## Overview
Replace the current flat table-based Content Command Centre with a Kanban pipeline board, a "Needs My Action" strip, and a structured Brief Emily form. The file `src/pages/Dashboard.tsx` will be rewritten almost entirely while preserving the Ledger tab, review drawer, realtime subscription, and all Supabase query/mutation logic.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│  HEADER  — Content Command Centre                        │
├──────────────────────────────────────────────────────────┤
│  METRICS BAR  — 4 cards: Pending Review | Approved |     │
│                 Scheduled | Published This Month         │
├──────────────────────────────────────────────────────────┤
│  "NEEDS MY ACTION" STRIP  — amber-highlighted cards      │
│  (Pending Review items only, or "You're all clear")      │
├──────────────────────────────────────────────────────────┤
│  TOGGLE: [Pipeline] [Calendar]    + [Brief Emily] btn    │
├──────────────────────────────────────────────────────────┤
│  KANBAN BOARD (horizontally scrollable)                  │
│  Queued | Briefed | In Draft | Pending Review |          │
│  Approved | Scheduled | Published                        │
│  ┌─────┐ ┌─────┐ ┌─────┐ ...                            │
│  │Card │ │Card │ │Card │                                 │
│  └─────┘ └─────┘ └─────┘                                │
├──────────────────────────────────────────────────────────┤
│  OR: 14-DAY CALENDAR VIEW (toggle)                       │
├──────────────────────────────────────────────────────────┤
│  SIDEBAR (lg only): Emily Suggests (reduced weight)      │
└──────────────────────────────────────────────────────────┘
```

## What Changes

### 1. Metrics Bar — Simplified to 4 cards
Remove "Total Queue" and "In Draft". Keep:
- **Pending My Review** — status in draft/in_progress with draft_content and not approved
- **Approved** — james_approved = true, not published
- **Scheduled** — has target_publish_date set, status = approved
- **Published This Month** — status = published, published_at in current month

### 2. "Needs My Action" Strip (new)
A dark/amber-tinted horizontal strip above the board showing compact cards for items in Pending Review status. Each card: title (truncated), type badge, priority. Clicking opens the review drawer. If empty, show "You're all clear — no content needs your attention right now."

### 3. Kanban Board (replaces table)
Seven columns mapped to statuses:

| Column | DB Status Match |
|---|---|
| Queued | `pending` and no draft |
| Briefed | `briefed` |
| In Draft | `in_progress` or `draft` with draft_content |
| Pending Review | draft with `james_approved = false` and draft_content |
| Approved | `approved` |
| Scheduled | `approved` with `target_publish_date` set |
| Published | `published` |

Each column header shows a count badge.

**Drag and drop** using `@dnd-kit/sortable` (already installed). Moving a card between columns updates its `status` in Supabase. The board is horizontally scrollable with `overflow-x-auto`.

**Content Cards** display:
- Title (truncated)
- Priority bar (red/amber/grey)
- Content type badge
- **Channel scope toggles** — three small pill buttons (SEO/Blog, Social, Email) that toggle on/off on click, stored via a new local state map (will write to a `channels` jsonb column if available, otherwise local-only for now)
- Target date (if set)
- Context-sensitive quick action button per column

Cards in Pending Review column get an amber/gold border highlight.

### 4. Brief Emily — Structured Form (Sheet/Modal)
Replace the sidebar input with a slide-out Sheet triggered by a "Brief Emily" button. Fields:
- Topic/Working title (required, text input)
- Category dropdown (Braking, Suspension, Engine, Drivetrain, Cooling, Electrical, Other)
- Content type dropdown (SEO Article, Decision Page, Regional SEO, Email Newsletter, Social Post)
- Channel scope checkboxes (SEO/Blog, Social, Email)
- Priority radio (High=90 / Medium=60 / Low=30)
- Target publish date (date picker)
- Additional notes (textarea)

On submit: insert into `mkt_seo_queue` with status `briefed`, card appears in Queued/Briefed column.

### 5. Calendar View Toggle
A toggle button switches between Pipeline (Kanban) and Calendar. Calendar view reuses existing 14-day calendar logic but color-codes by channel: green = SEO/Blog, orange = Social, purple = Email.

### 6. Emily Suggests
Keep in sidebar on desktop but reduce visual weight — smaller cards, muted styling, collapsible.

### 7. Preserved
- Ledger tab (untouched)
- Review drawer (Sheet) with approve/revision/set-date actions
- Realtime subscription
- All Supabase queries and mutations
- Mobile: columns stack vertically, calendar hidden

## Files Modified
- **`src/pages/Dashboard.tsx`** — Full rewrite of the Queue tab section. ~600-700 lines total.

## Dependencies
- `@dnd-kit/sortable` — already installed, will also need `@dnd-kit/core` and `@dnd-kit/utilities` (peer deps to add)

## Mobile Behavior
- Kanban columns stack vertically on screens < lg
- Calendar view hidden on mobile by default
- Brief Emily form is full-screen Sheet on mobile
- "Needs My Action" strip scrolls horizontally

