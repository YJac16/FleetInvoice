import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { InvoicesPage } from "@/features/invoices/components/invoices-page";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <InvoicesPage />
    </SearchParamsBoundary>
  );
}
