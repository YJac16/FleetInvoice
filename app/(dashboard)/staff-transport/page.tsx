import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { StaffTripsMonitorPage } from "@/features/trips/components/staff-trips-monitor-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <StaffTripsMonitorPage />
    </SearchParamsBoundary>
  );
}
