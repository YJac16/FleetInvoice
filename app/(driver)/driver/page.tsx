import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { DriverTodayPage } from "@/features/driver-portal/components/driver-today-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <DriverTodayPage />
    </SearchParamsBoundary>
  );
}
