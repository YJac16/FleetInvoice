import { SearchParamsBoundary } from "@/components/shared/search-params-boundary";
import { CompanyInvoicesPage } from "@/features/company/components/company-invoices-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SearchParamsBoundary>
      <CompanyInvoicesPage />
    </SearchParamsBoundary>
  );
}
