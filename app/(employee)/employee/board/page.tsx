import { Suspense } from "react";

import { EmployeeBoardPage } from "@/features/attendance/components/employee-board-page";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={3} />}>
      <EmployeeBoardPage />
    </Suspense>
  );
}
