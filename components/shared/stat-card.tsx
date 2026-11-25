import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  href?: string;
  /** Tighter padding and smaller value, for 2-column phone grids. */
  compact?: boolean;
  className?: string;
};

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  compact = false,
  className,
}: StatCardProps) {
  const card = (
    <Card
      className={cn(
        "rounded-2xl border-border/80 shadow-none",
        href && "transition-colors hover:bg-muted/40",
        !href && className
      )}
    >
      <CardHeader className={cn(
          "flex flex-row items-center justify-between space-y-0 pb-2",
          compact && "px-3 pt-3 pb-1 sm:px-4 sm:pt-4 sm:pb-2"
        )}>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent className={cn(compact && "px-3 pb-3 sm:px-4 sm:pb-4")}>
        <div
          className={cn(
            "text-3xl font-semibold tracking-tight",
            compact && "text-2xl sm:text-3xl"
          )}
        >
          {value}
        </div>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link href={href} className={cn("block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      {card}
    </Link>
  );
}
