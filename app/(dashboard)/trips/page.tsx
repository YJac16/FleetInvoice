import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { TripsPage } from "@/features/trips/components/trips-page";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <TripsPage />
    </SearchParamsBoundary>
  );
}
