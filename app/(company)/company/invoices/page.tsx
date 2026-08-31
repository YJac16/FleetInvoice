import { InvoicesPage } from "@/features/invoices/components/invoices-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <InvoicesPage
      title="Invoices"
      description="Period invoices for your companies — open Print for a browser PDF."
      printBasePath="/company/invoices"
      showGenerate={false}
    />
  );
}
