import { Badge } from "@/components/ui/badge";
import { ownerBucket, OWNER_LABELS, type OwnerTag } from "@/lib/owner-tag";

export function OwnerBadge({ owner }: { owner: OwnerTag | null | undefined }) {
  const bucket = ownerBucket(owner);
  return (
    <Badge variant={bucket === "unassigned" ? "outline" : "secondary"} data-owner={bucket}>
      {OWNER_LABELS[bucket]}
    </Badge>
  );
}
