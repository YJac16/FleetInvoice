import Link from "next/link";

import { GoOpsSymbol } from "@/components/brand/goops-symbol";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

type GoOpsLogoProps = {
  /** Sidebar-aware foreground, or explicit white on dark chrome. */
  variant?: "default" | "sidebar" | "on-dark";
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  href?: string;
  className?: string;
  onClick?: () => void;
};

const symbolSizes = { sm: 22, md: 26, lg: 32 } as const;
const textSizes = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
} as const;

export function GoOpsLogo({
  variant = "default",
  size = "md",
  showTagline = false,
  href,
  className,
  onClick,
}: GoOpsLogoProps) {
  const symbolSize = symbolSizes[size];
  const opsClass =
    variant === "on-dark"
      ? "font-sans font-bold text-white"
      : variant === "sidebar"
        ? "font-sans font-bold text-sidebar-foreground"
        : "font-sans font-bold text-foreground";

  const lockup = (
    <span className={cn("inline-flex flex-col", className)}>
      <span className="inline-flex items-center gap-2">
        <GoOpsSymbol size={symbolSize} />
        <span className={cn("leading-none tracking-tight", textSizes[size], opsClass)}>
          Ops
        </span>
      </span>
      {showTagline ? (
        <span
          className={cn(
            "mt-1.5 text-[10px] font-medium tracking-[0.22em] uppercase",
            variant === "on-dark"
              ? "text-white/70"
              : variant === "sidebar"
                ? "text-sidebar-foreground/70"
                : "text-muted-foreground"
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
