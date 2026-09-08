import { cn } from "@/lib/utils";

const LOGO_SRC = {
  full: {
    light: "/brand/goops-logo.svg",
    dark: "/brand/goops-logo-light.svg",
  },
  symbol: {
    light: "/brand/goops-symbol.svg",
    dark: "/brand/goops-symbol.svg",
  },
} as const;

type GoOpsLogoProps = {
  variant?: "full" | "symbol";
  /** Use `dark` on Deep Navy / dark backgrounds. */
  theme?: "light" | "dark";
  className?: string;
  height?: number;
};

export function GoOpsLogo({
  variant = "full",
  theme = "light",
  className,
  height = 32,
}: GoOpsLogoProps) {
  const src = LOGO_SRC[variant][theme];
  const width =
    variant === "full" ? Math.round(height * (180 / 48)) : height;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand SVGs are static assets
    <img
      src={src}
      alt="GoOps"
      width={width}
      height={height}
      className={cn("h-auto w-auto shrink-0", className)}
      style={{ height, width: "auto", maxWidth: width }}
    />
  );
}
