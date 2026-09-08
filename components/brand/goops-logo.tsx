import Link from "next/link";

import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

const LOGO_SRC = {
  /** Symbol + white Ops — navy / dark chrome (sidebar, driver, login on navy). */
  dark: "/brand/main-logo-dark-transparent.png",
  /** Symbol + navy Ops — light backgrounds. */
  light: "/brand/lockup-light-transparent.png",
} as const;

type GoOpsLogoProps = {
  /** `dark` on navy/dark chrome; `light` on light backgrounds. */
  theme?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  href?: string;
  className?: string;
  onClick?: () => void;
};

const heights = { sm: 24, md: 28, lg: 36 } as const;
/** Founder lockup aspect ratio (width / height). */
const LOCKUP_ASPECT = 180 / 48;

export function GoOpsLogo({
  theme = "light",
  size = "md",
  showTagline = false,
  href,
  className,
  onClick,
}: GoOpsLogoProps) {
  const height = heights[size];
  const width = Math.round(height * LOCKUP_ASPECT);
  const src = LOGO_SRC[theme];

  const lockup = (
    <span className={cn("inline-flex flex-col", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- founder PNG lockups */}
      <img
        src={src}
        alt={APP_NAME}
        width={width}
        height={height}
        className="h-auto w-auto shrink-0"
        style={{ height, width: "auto", maxWidth: width }}
      />
      {showTagline ? (
        <span
          className={cn(
            "mt-1.5 text-[10px] font-medium tracking-[0.22em] uppercase",
            theme === "dark" ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {APP_TAGLINE}
        </span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-label={APP_NAME}
        className="inline-flex outline-none"
      >
        {lockup}
      </Link>
    );
  }

  return lockup;
}
