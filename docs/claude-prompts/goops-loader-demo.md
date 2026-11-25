# GoOps centred loader — demo only

Build on branch `feat/goops-loader` (from `demo` @ 684016e). Open a **DRAFT** PR into `demo`. Never touch `main`. No database, migration, or Vercel changes.

Creative's handoff is already on this branch in `docs/loader-source/`:

- `goops-loader.svg` — self-contained 1.2s animated SVG (keyframes inside the file)
- `goops-loader-static.svg` — reduced-motion / static fallback (mark only, same viewBox)
- `goops-loader.css` — `--goops-loader-size` and locked brand colour variables
- `goops-loader.html` — light/dark side-by-side demo with unique gradient ids per copy
- `README.md` — design notes

## What to build

A small reusable `<GoOpsLoader />` in `components/brand/` (new file). Do not change `goops-logo.tsx` or `goops-symbol.tsx`. This is GoOps' own mark, not a client logo — leave client brand assets alone.

**Inline the SVG in the React component**, copied from `docs/loader-source/goops-loader.svg`. No new dependencies. Keep it small: inline SVG + CSS only. Do not add Lottie or an image-only implementation as the primary path.

### Animation (do not invent a new one)

The mark is unchanged from `public/brand/goops-mark.svg`. Do not redraw paths or change the official gradient `#0056FC → #00B4F3 → #01C7C7 → #01F183`.

It is a 1.2s seamless loop that moves by **transform only**:

1. The official mark stays centred and breathes: `scale(1)` ↔ `scale(1.03)`, ease-in-out.
2. A soft cyan track, a short brand-gradient arc, and a green leading dot orbit at constant speed (CSS `rotate` only). Track opacity is static. No filters or paint-heavy effects.

It works on both white (`#FFFFFF`) and `#0B0F14`. Counters are transparent; no invert or dark-mode recolour is needed.

### Implementation rules

- Keep the `--goops-loader-size` CSS variable (app default around 96px is fine; the CSS demo uses 160px). Size the SVG with that variable.
- Prefix gradient `id`s, or generate them with `useId()`, so several copies on one page do not clash (`url(#…)`). The HTML demo does this (`goops-loader-light-mark`, `goops-loader-dark-mark`, and matching arc ids).
- Host CSS variables do **not** reach an SVG loaded as `<img>`. Prefer inline SVG. If any `<img>` path is used, rely on the baked-in hex fallbacks already in the source (`stop-color="var(--goops-blue, #0056FC)"` and the same pattern for cyan, teal, and green).
- Honour `prefers-reduced-motion: reduce`: stop animations, hide `.goops-loader__orbit`, leave the static official mark (matches `goops-loader-static.svg`). The animated SVG already has this media query; keep it. You may also swap to the static SVG.
- Accessibility: expose `role="status"` and `aria-label="Loading"` (on the wrapper or the SVG).
- Centre the mark in the content area for route and full-page waits (flex or grid with place-items center).

### Where to use it

The listed `loading.tsx` files are currently skeleton-only. Replace those route-level files with a centred `<GoOpsLoader />` — they are first-page / blank-page loads:

- `app/(dashboard)/loading.tsx`
- `app/(dashboard)/trips/loading.tsx`
- `app/(dashboard)/dispatch/loading.tsx`
- `app/(dashboard)/invoices/loading.tsx`
- `app/(dashboard)/staff-transport/loading.tsx`
- `app/(driver)/driver/loading.tsx`

Also use the centred mark for full-page data waits (blank content area while a page or query is pending).

**Keep skeletons where they help.** Do not remove `LoadingSkeleton`, `CardGridSkeleton`, or `KanbanSkeleton` from in-page lists, tables, or kanban refreshes. Centred mark = first load or a blank page. Skeletons = in-page lists that already have a layout.

### Quality gate

- Add unit tests: the component exposes `role="status"` and `aria-label="Loading"`; reduced-motion hides the orbit / uses the static mark; two mounted copies get unique gradient ids.
- Run lint, typecheck, and tests. Fix anything you break.
- Open a **DRAFT** PR into `demo`. Never touch `main`.
