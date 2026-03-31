

# Dashboard Card Readability Fix

## Problems Identified
1. **Kanban columns too narrow** — 7 columns forced into `lg:grid-cols-7` leaves ~140px per column on a 1159px viewport, making card text unreadable
2. **Text sizes too small** — 9px and 10px font sizes throughout cards
3. **Emily Suggests panel steals horizontal space** — sits alongside the Kanban board in a flex row, further squeezing columns
4. **Cards cramped** — too much information packed into tiny space (title, type badge, priority, channel toggles, date, action button)

## Solution

### 1. Move Emily Suggests below the board
Remove the side-by-side `flex-row` layout between the Kanban board and the Suggests panel. Place Suggests below the board as a full-width row of 3 cards. This gives the board 100% width.

### 2. Make the Kanban board horizontally scrollable with wider columns
Change from `lg:grid-cols-7` to a scrollable flex layout with `min-w-[240px]` per column (up from 220px). This allows natural horizontal scrolling when needed rather than crushing columns.

### 3. Increase card text sizes
- Title: `text-xs` (12px) → `text-sm` (14px)
- Type badge: `text-[10px]` → `text-xs` (12px)  
- Priority: `text-[9px]` → `text-xs`
- Channel toggles: `text-[9px]` → `text-[11px]`
- Date/action row: `text-[10px]` → `text-xs`
- Card padding: `p-2.5` → `p-3`

### 4. Increase column header readability
- Column label: `text-xs` → `text-sm`
- Count badge slightly larger

### 5. DragOverlay width matches new card width

## Files Modified
- **`src/pages/Dashboard.tsx`** — ~8 targeted line-range edits to card component, column component, board grid, and suggestions layout

