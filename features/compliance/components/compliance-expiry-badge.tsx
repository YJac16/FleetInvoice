import { Badge } from "@/components/ui/badge";
import {
  complianceStatusForDate,
  complianceStatusLabel,
  type ComplianceExpiryStatus,
} from "@/features/compliance/lib/compliance-status";
import { cn } from "@/lib/utils";

const VARIANT: Record<
  ComplianceExpiryStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  expired: "destructive",
  due_7: "destructive",
  due_30: "secondary",
  due_60: "outline",
  ok: "outline",
  not_captured: "secondary",
};

export function ComplianceExpiryBadge({
  expiresOn,
  className,
}: {
  expiresOn: string | null | undefined;
  className?: string;
}) {
  const status = complianceStatusForDate(expiresOn);
  return (
    <Badge
      variant={VARIANT[status]}
      className={cn(
        status === "not_captured" && "bg-muted text-muted-foreground",
        status === "due_30" && "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        status === "due_60" && "text-muted-foreground",
        className
      )}
    >
      {complianceStatusLabel(status)}
    </Badge>
  );
}
