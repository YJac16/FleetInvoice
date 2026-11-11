import { AdminLoading } from "@/components/admin/admin-loading";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function TripsLoading() {
  return (
    <AdminLoading
      label="Loading trips"
      skeleton={
        <>
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={6} />
        </>
      }
    />
  );
}
