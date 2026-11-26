import { useId, type CSSProperties } from "react";

import { GOOPS_MARK_PATH } from "@/components/brand/goops-mark-path";
import { cn } from "@/lib/utils";

/** Rendered height in px. Without `size` the loader is 96px (route-level default). */
const SIZES = { xs: 14, sm: 20, md: 40, lg: 56 } as const;

type GoOpsLoaderProps = {
  className?: string;
  /** Shown to assistive tech. Defaults to "Loading". */
  label?: string;
  size?: keyof typeof SIZES;
  /** `block` stacks the mark over a visible caption. Default is just the mark. */
  layout?: "inline" | "block";
  /** Hide from assistive tech when the parent already names the busy state. */
  decorative?: boolean;
};

const LOADER_CSS = `
.goops-loader{width:var(--goops-loader-size,96px);height:var(--goops-loader-size,96px);display:block}
.goops-loader__breathe{transform-box:fill-box;transform-origin:center;animation:goops-loader-breathe 1.2s ease-in-out infinite}
.goops-loader__orbit{transform-box:fill-box;transform-origin:center;animation:goops-loader-spin 1.2s linear infinite}
@keyframes goops-loader-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes goops-loader-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){
.goops-loader__breathe,.goops-loader__orbit{animation:none !important}
.goops-loader__orbit{display:none}
}`;

/**
 * Centred GoOps loading mark: inline SVG, transform-only animation (1.2s loop).
 * Source: docs/loader-source/goops-loader.svg. Honours prefers-reduced-motion
 * (orbit hidden, static official mark remains).
 */
export function GoOpsLoader({
  className,
  label = "Loading",
  size,
  layout = "inline",
  decorative = false,
}: GoOpsLoaderProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const markId = `goops-loader-${uid}-mark`;
  const arcId = `goops-loader-${uid}-arc`;

  return (
    <div
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      data-slot="goops-loader"
      className={cn(
        "print:hidden",
        layout === "block" ? "flex flex-col items-center gap-2 py-4" : "inline-flex",
        className
      )}
      style={size ? ({ "--goops-loader-size": `${SIZES[size]}px` } as CSSProperties) : undefined}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-68 -301.5 1280 1280"
        fill="none"
        className="goops-loader"
        aria-hidden="true"
        focusable="false"
      >
        <style>{LOADER_CSS}</style>
        <defs>
          <linearGradient id={markId} x1="0" y1="315" x2="1200" y2="315" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--goops-blue, #0056FC)" />
            <stop offset="0.45" stopColor="var(--goops-cyan, #00B4F3)" />
            <stop offset="0.7" stopColor="var(--goops-teal, #01C7C7)" />
            <stop offset="1" stopColor="var(--goops-green, #01F183)" />
          </linearGradient>
          <linearGradient id={arcId} x1="-592" y1="0" x2="592" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--goops-blue, #0056FC)" />
            <stop offset="0.55" stopColor="var(--goops-cyan, #00B4F3)" />
            <stop offset="0.8" stopColor="var(--goops-teal, #01C7C7)" />
            <stop offset="1" stopColor="var(--goops-green, #01F183)" />
          </linearGradient>
        </defs>
        <g transform="translate(572 338.5)">
          <g className="goops-loader__orbit">
            <circle r="640" fill="transparent" stroke="none" />
            <circle
              className="goops-loader__track"
              r="592"
              fill="none"
              stroke="var(--goops-cyan, #00B4F3)"
              strokeWidth="16"
              strokeOpacity="0.3"
            />
            <path
              className="goops-loader__arc"
              d="M -583.006 102.800 A 592 592 0 0 1 -0.000 -592.000"
              fill="none"
              stroke={`url(#${arcId})`}
              strokeWidth="28"
              strokeLinecap="round"
            />
            <circle className="goops-loader__dot" cx="0" cy="-592" r="42" fill="var(--goops-green, #01F183)" />
          </g>
        </g>
        <g className="goops-loader__breathe">
          <g transform="translate(0 630) scale(1 -1)">
            <path d={GOOPS_MARK_PATH} fill={`url(#${markId})`} />
          </g>
        </g>
      </svg>
      {layout === "block" && !decorative ? (
        <span className="text-sm text-muted-foreground">{label}</span>
      ) : null}
    </div>
  );
}

/** Centred full-area loader for route-level / blank-page waits. */
export function GoOpsLoaderCentered({ className }: { className?: string }) {
  return (
    <div className={cn("grid min-h-[60vh] w-full place-items-center", className)}>
      <GoOpsLoader />
    </div>
  );
}
