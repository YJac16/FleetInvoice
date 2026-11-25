# GoOps UI pass — slice 1 (demo only)

Build on `feat/ui-pass-slice1` (from `demo` @ 6963771). Open a **DRAFT** PR into `demo`. Never touch `main`. No invoice or trip logic, routes, database, or migrations. No new dependencies (`package.json` already has `tw-animate-css` and `sonner@^2.0.7`; no Framer Motion, no Recharts). No chart draw-in — that waits until after 7 Dec. Loader already on demo (`468a6cf`, `components/brand/goops-loader.tsx`); do not redo it.

## 1. Demo bar on phones

Files (PRs #86, #89):

- `components/demo/role-switcher.tsx` — mounted from `app/layout.tsx`
- `components/demo/role-switcher-panel.tsx` — `fixed right-3 bottom-3 z-[100]`; CSS first-paint via `data-pref`, `data-demo-bar-pill`, `data-demo-bar-expanded`; reserves `body` padding with `--demo-bar-height` + `0.75rem`
- `app/globals.css` — under `max-width: 639px` the pill shows unless `data-pref="expanded"`
- Bottom nav: `DriverBottomNav` (`components/layout/driver-shell.tsx`) and `EmployeeBottomNav` (`components/layout/employee-shell.tsx`) — both `fixed inset-x-0 bottom-0 z-30` with `pb-[env(safe-area-inset-bottom)]`. Driver main uses `.driver-tab-clearance` (`padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px))`). Employee main uses `pb-24`.
- Sign out must stay tappable: `DriverHeader` in `driver-shell.tsx` (top-right icon); `UserNav` (`components/layout/user-nav.tsx`); company header (`components/layout/company-shell.tsx`); `app/app/no-access/sign-out-button.tsx` (also on `/app/unavailable`, which already has `pb-40`; `/app/no-access` does not); profile (`features/profile/components/profile-page.tsx`).

At ≤390px, start as the pill. Expanded on desktop is fine. The 639px CSS default collapses phones — do not regress it into the 320–427px range. Leftover bug is overlap, not the breakpoint: `z-[100]` sits on the z-30 tab bars; reserved padding omits `env(safe-area-inset-*)` and nav height. Honour `env(safe-area-inset-*)` on position and reserved space. Sit the bar *above* the driver/employee tab bar, not over it. Keep CSS-first paint. Update `tests/unit/demo-role-switcher-panel.test.tsx` if CSS or reservation changes.

## 2. Motion set (loader's style)

Cap new motion at 300ms (BusyButton press 150–200ms). Opacity/transform only, no layout shift, off under `prefers-reduced-motion`. Reuse tokens in `goops-loader.tsx` and `PageFadeIn` (`components/shared/page-fade-in.tsx`: `motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-reduce:animate-none`, already in `app-shell.tsx` and `driver-shell.tsx`).

- **Page / skeleton fade.** Reuse `PageFadeIn`. Apply the same 300ms `motion-safe` fade to `components/shared/card-grid-skeleton.tsx` and `components/ui/skeleton.tsx`. No second fade.
- **Count-up on dashboard KPI tiles.** In `StatCard` (`components/shared/stat-card.tsx`), used by `features/dashboard/components/dashboard-page.tsx`. Today's tiles are plain numbers (`ops.today_*`, `counts.*`); `value` is `string | number`. Animate only a number or parseable numeric/ZAR string (`formatZarFromCents` in `lib/plans.ts`: `R1,990` / `R1,990.50`). Keep grouping and the `R` prefix; final DOM text must equal the original `value` exactly. Skip if reduced motion or the value isn't numeric (`—`, labels). Run once when data first arrives; do not restart on every parent render.
- **BusyButton press feedback.** There is no `BusyButton` on demo (PR #75 did not land; #96 shipped the loader only). Add a small wrapper around `Button` (`components/ui/button.tsx`). Press: light opacity or scale, 150–200ms; ignore clicks while pending; honour reduced motion. No new animation library; do not mass-migrate buttons. Export it with tests; use it in one or two pending actions only if that avoids invoice/trip logic (e.g. `SignOutButton`).
- **Sonner toasts.** Already wired in `components/shared/providers.tsx` (`<Toaster richColors closeButton position="top-right" />`) via `components/ui/sonner.tsx` (`sonner`, `mobileOffset`, `cn-toast`). One toast style; enter/exit ≤300ms; respect reduced motion. No new toast library.

## Quality gate

- Tests: reduced-motion (fade, count-up, BusyButton, toasts if practical); count-up ends at the exact value (a number and a `R1,990`-style string). Extend demo-bar tests for overlap / safe-area if CSS changes.
- `npm run lint`, `npx tsc --noEmit`, `npm test`. Fix anything you break.
- 390px and desktop screenshots if possible.
- Open a **DRAFT** PR into `demo`. Never touch `main`.
