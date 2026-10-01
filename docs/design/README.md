# Design 2026 — the target design

This folder is the **specification** for the redesign tasks T90–T105 in `docs/TASKS.md`.

| Path | What it is |
| --- | --- |
| `boards/*.dc.html` | The design boards. Plain HTML with **inline styles**: every size, colour, radius, gap and font weight in the design is written there. Read them for exact values. |
| `boards/canvas.json` | Board sizes and titles. |
| `reference/*.png` | Each board rendered at its size. This is what the finished page must look like. |

Regenerate the PNGs after changing a board: `npm i --no-save playwright && node tools/design/render-boards.js`.

The boards show **example data** ("Robot Cell Upgrade", "Maya"). Match the layout, sizes, colours, spacing and
wording pattern. Do not copy the example numbers into the app. Show the real data.

## Boards

| Board | Size | Page in the app |
| --- | --- | --- |
| `Main` | 1440×960 | Logo: one colour, light and dark, app icon, favicons |
| `LogoConcepts` | 1440×960 | Logo shapes (Flow is the chosen one) |
| `Landing` | 1440×2900 | `#/` public home page |
| `Dashboard` | 1440×960 | `#/customer/dashboard` (also the sidebar for every role) |
| `SupplierDash` | 1440×960 | `#/supplier/dashboard` |
| `Workspace` | 1440×960 | `#/customer/projects/<id>` and `#/supplier/projects/<id>` |
| `BoardDrawer` | 1440×960 | `#/<role>/projects/<id>/board` |
| `OfferCompare` | 1440×960 | `#/customer/sourcing/<bidId>` (offer evaluation) |
| `InvoiceReview` | 1440×960 | `#/customer/invoice/<id>` |
| `StatusSystem` | 1440×900 | Status chips, buttons, empty states, form errors — used everywhere |
| `PhoneToday` | 390×844 | Supplier dashboard on a phone |
| `PhoneLogTime` | 390×844 | "Log time" form on a phone |
| `PhoneApprove` | 390×844 | `#/customer/approvals` on a phone |

## Design tokens

Use these everywhere. They are the values used in the boards.

| Token | Value |
| --- | --- |
| Font (text) | `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", "Helvetica Neue", Arial, sans-serif` |
| Font (headings, big numbers) | same, with `"SF Pro Display"` instead of `"SF Pro Text"` |
| Text | `#1D1D1F` · secondary `#424245` · muted `#6E6E73` |
| Page background | `#F5F5F7` (phone pages `#F2F2F7`) |
| Card | `#FFFFFF`, radius 20 px (hero cards 24 px, big tiles 28 px), shadow `0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.04)` |
| Hairline | `rgba(0,0,0,.06)` lines between rows, inset 70–78 px when the row has an icon |
| Accent | `#2563EB`, pressed `#1D4ED8`, tint `#E8EEFB` |
| Navy (dark tiles) | `#0D1B32` |
| Grey fill (secondary buttons) | `#E8E8ED` |
| Segmented control | track `rgba(118,118,128,.12)`, radius 9–11 px; selected segment white with `0 1px 3px rgba(0,0,0,.12)` |
| Buttons | pill, radius 980 px; primary blue with white text; secondary grey fill with dark text; destructive = red text `#D70015`, no fill |
| Chip tints | blue `#E8EEFB`/`#1D4ED8` · orange `#FFF1E0`/`#A34F00` · green `#E3F5E8`/`#1E7A35` · red `#FDE7E9`/`#C01024` · purple `#F3E8FB`/`#7A2DB0` · grey `#F0F0F2`/`#424245` |
| Status dots | blue `#2563EB` · orange `#FF9F0A` · red `#FF3B30` · green `#34C759` |
| Headings | page title 34 px / 700 / −0.02em; section heading 20–22 px / 600–700; card heading 17 px / 600 |
| Small label | 13 px muted; uppercase kickers 13 px / 600 / +0.04em |

**Logo:** the Flow mark is two dots joined by one curve, in one colour.
`<path d="M14 50C24 42 40 22 50 14"/>` with `stroke-width 6`, round caps, plus
`<circle cx="14" cy="50" r="8.5"/>` and `<circle cx="50" cy="14" r="8.5"/>` on a 64×64 grid.
Wordmark "CraftCrew" in the display font, weight 600, letter-spacing −0.02em, the same colour as the mark.

## How to compare a page with its board

1. Start two demo servers with **fresh** data (see "Rules for every design task" in `docs/TASKS.md`).
2. `node tools/design/shot.js http://localhost:3100 shots customer:/customer/dashboard`
   (phone boards: `W=390 H=844`; German: `LANG=de`).
3. Put `shots/…png` next to `docs/design/reference/Dashboard.png` and compare: layout, order of blocks,
   sizes, colours, spacing, radius, font weights. Fix differences until they look the same.
