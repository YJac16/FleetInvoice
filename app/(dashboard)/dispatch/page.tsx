import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { DispatchBoardPage } from "@/features/dispatch/components/dispatch-board-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <DispatchBoardPage />
    </SearchParamsBoundary>
  );
}
