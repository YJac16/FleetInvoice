import { Badge } from "@/components/ui/badge";
import {
  PRICING_STATUS_LABELS,
  PRICING_STATUS_STYLES,
} from "@/lib/pricing/constants";
import { cn } from "@/lib/utils";
import type { PricingStatus } from "@/types/database";

interface PricingStatusBadgeProps {
  status: PricingStatus;
  className?: string;
}

export function PricingStatusBadge({
  status,
  className,
}: PricingStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(PRICING_STATUS_STYLES[status], className)}
    >
      {PRICING_STATUS_LABELS[status]}
    </Badge>
  );
}
