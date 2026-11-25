# GoOps loader

Design asset only. Engineering integrates this into the app. This folder is not an app change and was not written into any repo.

## Logo source

- Final raster pack: `/workspace/goops-final-logos/` — in particular `mark-transparent.png` (and the rest of that pack: lockups, favicons). This is the clearly labelled final logo set.
- Vector paths used exactly (not redrawn or retraced) from the shipping mark SVG, which matches that final mark: `/workspace/goops-demo/repo/public/brand/goops-mark.svg`. The same file hash appears across the GoOps / FleetInvoice checkouts on the box (`public/brand/goops-mark.svg`).

The mark is the official G / infinity / arrow, with the locked gradient `#0056FC → #00B4F3 → #01C7C7 → #01F183`.

## Animation

A 1.2 s seamless loop, light and calm:

1. The official mark stays centred and breathes slightly (`scale(1)` ↔ `scale(1.03)`, ease-in-out).
2. A soft cyan track, a short brand-gradient arc, and a green leading dot orbit the mark at a constant speed (CSS `rotate` only).

Motion uses **transform only** (scale and rotate). The track’s opacity is static. No filters, no paint-heavy effects.

It is built to sit on both light and dark surfaces. The mark’s counters are transparent, and the official gradient is unchanged. Checked on `#FFFFFF` and `#0B0F14`.

## Files

| File | What it is |
| --- | --- |
| `goops-loader.svg` | Self-contained animated SVG (CSS keyframes inside). |
| `goops-loader.css` | Demo + integration variables (`--goops-loader-size`, brand colours). |
| `goops-loader.html` | Demo: inline SVG, centred, light and dark side by side. |
| `goops-loader-static.svg` | Reduced-motion / static fallback (mark only, same viewBox). |
| `goops-loader-static.png` | Static fallback, 128×128, transparent (`@1x`). |
| `goops-loader-static@2x.png` | Static fallback, 256×256, transparent (`@2x`). |
| `goops-loader-preview.gif` | Preview, light and dark side by side, 3 loops, 960×540, 3.6 s, 30 fps. |
| `goops-loader-preview.mp4` | Same preview as H.264 (CRF 18, yuv420p). |
| `README.md` | This file. |

No Lottie file is included.

## Usage

### As an image

Self-contained: animation and colours travel with the file (hex fallbacks). Host CSS variables do not apply to an SVG loaded as `img`.

```html
<img src="goops-loader.svg" width="96" height="96" alt="Loading" />
```

The SVG already honours `prefers-reduced-motion: reduce` (orbit hides, breathe stops, mark stays put).

### Inline SVG (size and colours via CSS variables)

Open `goops-loader.html` for a working example. Size the loader with `--goops-loader-size`. Brand colours default to the locked gradient and can be overridden only if you intend to theme a copy — the shipping mark should keep these values:

```css
:root {
  --goops-loader-size: 96px;
  --goops-blue: #0056FC;
  --goops-cyan: #00B4F3;
  --goops-teal: #01C7C7;
  --goops-green: #01F183;
}

svg.goops-loader {
  width: var(--goops-loader-size);
  height: var(--goops-loader-size);
  display: block;
}
```

If you inline more than one copy on the same page, give the gradient `id` attributes unique prefixes so `url(#…)` references do not clash. The demo does this (`goops-loader-light-mark`, `goops-loader-dark-mark`, and so on).

### Static fallback

Use this if you would rather swap the asset yourself, or as a raster fallback:

```html
<img src="goops-loader-static.svg" width="96" height="96" alt="" />
<!-- or goops-loader-static.png / goops-loader-static@2x.png -->
```

### Dark mode

No invert, recolour, or extra variant is required. Place the same asset on a light or dark background. Preview surfaces are `#FFFFFF` and `#0B0F14`.

## Reduced motion

Inside `goops-loader.svg`, a `prefers-reduced-motion: reduce` media query sets animation to none and hides `.goops-loader__orbit`. What remains is the static official mark, matching `goops-loader-static.svg`.

## Notes

- Do not redraw or replace the mark paths, and do not change the official gradient stops.
- `stop-color="var(--goops-blue, #0056FC)"` (and the other stops) is for inline theming. Tools that do not understand CSS `var()` (for example cairosvg) will fail to paint the gradient; regenerate rasters in a browser if needed.
- Loop check: frame at 0 s and frame at 1.2 s are pixel-identical.
- This is a design handoff only.
