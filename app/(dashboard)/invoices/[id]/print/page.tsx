import { InvoicePrintPage } from "@/features/invoices/components/invoice-print-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoicePrintPage invoiceId={id} backHref="/invoices" />;
}
