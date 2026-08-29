import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatZarFromCents,
  isRecommendedPlan,
  labelForModule,
  vehicleAllowanceCopy,
} from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { PlanWithModules } from "@/types";

type PlanCardProps = {
  plan: PlanWithModules;
  isCurrent: boolean;
  onCheckout?: () => void;
  checkoutEnabled?: boolean;
};

export function PlanCard({
  plan,
  isCurrent,
  onCheckout,
  checkoutEnabled = false,
}: PlanCardProps) {
  const recommended = isRecommendedPlan(plan.code);
  const price = formatZarFromCents(plan.monthly_price_cents);
  const allowance = vehicleAllowanceCopy(plan);

  return (
    <Card
      role="listitem"
      className={cn(
        "h-full rounded-2xl border-border/80 shadow-none",
        recommended && "ring-2 ring-accent",
        isCurrent && "bg-muted/30"
      )}
    >
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-xl">{plan.name}</CardTitle>
          {isCurrent ? <Badge>Current plan</Badge> : null}
          {recommended ? (
            <Badge variant={isCurrent ? "outline" : "default"}>
              Recommended
            </Badge>
          ) : null}
        </div>
        {plan.tagline ? (
          <p className="text-sm font-medium text-accent">{plan.tagline}</p>
        ) : null}
        <div>
          <p className="text-3xl font-semibold tracking-tight">{price}</p>
          <p className="text-xs text-muted-foreground">per month, excl. extras</p>
        </div>
        {allowance ? (
          <p className="text-sm text-muted-foreground">{allowance}</p>
        ) : null}
        {plan.description ? (
          <CardDescription className="text-sm leading-relaxed">
            {plan.description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Included modules
        </p>
        <ul className="space-y-1.5">
          {plan.module_keys.map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>{labelForModule(key)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="justify-between gap-2 bg-transparent">
        {isCurrent ? (
          <Button size="sm" variant="outline" disabled>
            Current plan
          </Button>
        ) : checkoutEnabled && onCheckout ? (
          <Button size="sm" variant={recommended ? "default" : "outline"} onClick={onCheckout}>
            Start checkout
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Invite-only — ask your WorkOps contact to change plan.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
