import { redirect } from "next/navigation";

import { FuelReviewPage } from "@/features/fuel/components/fuel-review-page";
import { requirePermission } from "@/lib/auth/require-permission";

export default async function Page() {
  await requirePermission("fuel:review");
  return <FuelReviewPage />;
}
