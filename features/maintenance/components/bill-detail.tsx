import { BillAttachmentPanel } from "@/features/maintenance/components/bill-attachment-panel";
import { BillLinesView, BillTotals } from "@/features/maintenance/components/bill-lines-view";
import { formatVatRate } from "@/features/maintenance/lib/vat";
import type { BillDetail } from "@/features/maintenance/types";
import { formatDate } from "@/utils/format";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

export function BillDetailView({ bill, canManage }: { bill: BillDetail; canManage: boolean }) {
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border bg-card px-4 py-4 sm:grid-cols-3">
        <Fact label="Supplier" value={bill.supplier_name} />
        <Fact label="Invoice number" value={bill.invoice_ref} />
        <Fact label="Bill date" value={formatDate(bill.bill_date)} />
        <Fact label="Vehicle" value={bill.vehicle_label ?? "—"} />
        <Fact
          label="VAT"
          value={`${formatVatRate(bill.vat_rate)} · amounts ${bill.vat_mode === "inclusive" ? "incl." : "excl."} VAT`}
        />
        {bill.odometer_km != null ? (
          <Fact label="Odometer" value={`${bill.odometer_km.toLocaleString("en-ZA")} km`} />
        ) : null}
        {bill.notes ? (
          <div className="col-span-2 min-w-0 sm:col-span-3">
            <dt className="text-xs text-muted-foreground">Notes</dt>
            <dd className="text-sm whitespace-pre-wrap break-words">{bill.notes}</dd>
          </div>
        ) : null}
      </dl>

      <section className="space-y-3" aria-labelledby="bill-lines-heading">
        <h2 id="bill-lines-heading" className="text-base font-medium">Lines</h2>
        <BillLinesView lines={bill.lines} />
        <BillTotals
          excl={bill.subtotal_excl}
          vat={bill.vat_amount}
          incl={bill.total_incl}
          vatLabel={`VAT (${formatVatRate(bill.vat_rate)})`}
        />
      </section>

      <BillAttachmentPanel
        billId={bill.id}
        hasAttachment={bill.has_attachment}
        mime={bill.attachment_mime}
        size={bill.attachment_size}
        canUpload={canManage && bill.status === "draft"}
      />
    </div>
  );
}
