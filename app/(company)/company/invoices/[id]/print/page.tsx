import { InvoicePrintPage } from "@/features/invoices/components/invoice-print-page";
import { isEmailDeliveryConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  return (
    <InvoicePrintPage
      invoiceId={id}
      backHref="/company/invoices"
      autoPrint={print === "1"}
      emailDeliveryConfigured={isEmailDeliveryConfigured()}
    />
  );
}
