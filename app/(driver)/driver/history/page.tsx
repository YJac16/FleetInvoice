import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { DriverHistoryPage } from "@/features/driver-portal/components/driver-history-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <DriverHistoryPage />
    </SearchParamsBoundary>
  );
}
