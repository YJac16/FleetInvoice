import { cn } from "@/lib/utils";

type GoOpsSymbolProps = {
  className?: string;
  size?: number;
};

/** Native GoOps G/infinity mark. Raster source: public/brand/goops-mark.png */
const MARK_ASPECT = 1200 / 630;

export function GoOpsSymbol({ className, size = 28 }: GoOpsSymbolProps) {
  const height = size;
  const width = Math.round(size * MARK_ASPECT);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand raster; sized by lockup
    <img
      src="/brand/goops-mark-ui.png"
      alt=""
      width={width}
      height={height}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
      aria-hidden
    />
  );
}
