import { InvoicesPage } from "@/features/invoices/components/invoices-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <InvoicesPage
      title="Invoices"
      description="Period invoices for your companies. Each row shows billed company, drivers, vehicles, and Download PDF."
      printBasePath="/company/invoices"
    />
  );
}
