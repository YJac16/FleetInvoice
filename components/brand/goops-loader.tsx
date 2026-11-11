"use client";

import { useId } from "react";

import { GOOPS_MARK_PATH } from "@/components/brand/goops-mark-path";
import { GoOpsSymbol } from "@/components/brand/goops-symbol";
import { cn } from "@/lib/utils";

const HEIGHTS = { xs: 14, sm: 20, md: 40, lg: 56 } as const;
const MARK_ASPECT = 1200 / 630;

type GoOpsLoaderProps = {
  size?: keyof typeof HEIGHTS;
  /** `block` centers the mark with a caption. `inline` is the button icon. */
  layout?: "inline" | "block";
  label?: string;
  /** Hide from assistive tech when the parent already names the busy state. */
  decorative?: boolean;
  className?: string;
};

const LOADER_CSS = `
.goops-loader-art { position: relative; display: inline-flex; line-height: 0; }
.goops-loader-art svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.goops-loader-stroke {
  fill: none;
  stroke-width: 28;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: goops-loader-draw 1.7s ease-in-out infinite;
}
.goops-loader-fill {
  width: 100%;
  height: 100%;
  object-fit: contain;
  animation: goops-loader-fill 1.7s ease-in-out infinite;
}
.goops-loader-pulse {
  transform-origin: center;
  animation: goops-loader-pulse 1.25s ease-in-out infinite;
}
@keyframes goops-loader-draw {
  0% { stroke-dashoffset: 100; opacity: 0.9; }
  62% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes goops-loader-fill {
  0%, 28% { opacity: 0.72; }
  55%, 100% { opacity: 1; }
}
@keyframes goops-loader-pulse {
  0%, 100% { opacity: 0.62; transform: scale(0.94); }
  50% { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .goops-loader-stroke { animation: none; stroke-dashoffset: 0; opacity: 0; }
  .goops-loader-fill, .goops-loader-pulse { animation: none; opacity: 1; transform: none; }
}
`;

export function GoOpsLoader({
  size = "md",
  layout = "inline",
  label = "Loading",
  decorative = false,
  className,
}: GoOpsLoaderProps) {
  const rawId = useId().replace(/:/g, "");
  const gradId = `goops-loader-${rawId}`;
  const height = HEIGHTS[size];
  const width = Math.round(height * MARK_ASPECT);
  const draw = size === "md" || size === "lg";

  const mark = draw ? (
    <span className="goops-loader-art" style={{ width, height }} aria-hidden>
      <svg viewBox="0 0 1200 630" width={width} height={height}>
        <defs>
          <linearGradient
            id={gradId}
            x1="0"
            y1="315"
            x2="1200"
            y2="315"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#0056FC" />
            <stop offset="0.45" stopColor="#00B4F3" />
            <stop offset="0.7" stopColor="#01C7C7" />
            <stop offset="1" stopColor="#01F183" />
          </linearGradient>
        </defs>
        <g transform="translate(0 630) scale(1 -1)">
          <path
            className="goops-loader-stroke"
            d={GOOPS_MARK_PATH}
            pathLength={100}
            stroke={`url(#${gradId})`}
          />
        </g>
      </svg>
      {/* Brand raster sits on the drawn outline. Sized by the art box. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/goops-mark-ui.png"
        alt=""
        width={width}
        height={height}
        draggable={false}
        className="goops-loader-fill"
      />
    </span>
  ) : (
    <span className="goops-loader-pulse inline-flex" aria-hidden>
      <GoOpsSymbol size={height} />
    </span>
  );

  return (
    <span
      className={cn(
        "print:hidden",
        layout === "block"
          ? "flex flex-col items-center gap-2 py-4"
          : "inline-flex items-center",
        className
      )}
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-hidden={decorative || undefined}
      data-slot="goops-loader"
    >
      <style>{LOADER_CSS}</style>
      {mark}
      {decorative ? null : layout === "block" ? (
        <span className="text-sm text-muted-foreground">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
