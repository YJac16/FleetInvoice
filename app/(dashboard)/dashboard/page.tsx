import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { DashboardPage } from "@/features/dashboard/components/dashboard-page";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <DashboardPage />
    </SearchParamsBoundary>
  );
}
