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
};

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
}: StatCardProps) {
  const card = (
    <Card
      className={cn(
        "rounded-2xl border-border/80 shadow-none",
        href && "transition-colors hover:bg-muted/40"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  );
}
