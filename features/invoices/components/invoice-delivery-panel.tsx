"use client";

import { Download, Mail, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateEmailList } from "@/lib/notifications/email-addresses";
import { sendInvoiceEmail } from "@/services/invoice-email.service";

export function InvoiceDeliveryPanel({
  organisationId,
  invoiceId,
  backHref,
  defaultToEmail,
  emailDeliveryConfigured,
  canSendEmail,
}: {
  organisationId: string;
  invoiceId: string;
  backHref: string;
  defaultToEmail?: string | null;
  emailDeliveryConfigured: boolean;
  canSendEmail: boolean;
}) {
  const [to, setTo] = useState(defaultToEmail ?? "");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const toCheck = validateEmailList(to, { required: true });
    if (toCheck.error) {
      toast.error(toCheck.error);
      return;
    }
    const ccCheck = validateEmailList(cc);
    if (ccCheck.error) {
      toast.error(ccCheck.error);
      return;
    }

    setSending(true);
    try {
      const printUrl =
        typeof window !== "undefined"
          ? window.location.href.split("?")[0]!
          : "";
      const result = await sendInvoiceEmail({
        organisationId,
        invoiceId,
        to,
        cc: cc.trim() || undefined,
        printUrl,
      });
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send invoice email"
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-6 space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" render={<Link href={backHref} />}>
          Back to invoices
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            className="gap-2"
            onClick={() => window.print()}
          >
            <Download className="size-4" />
            Download / Save PDF
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.print()}
          >
            <Printer className="size-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium">Download before you email</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Use Download / Save PDF with no email fields filled. Email is optional.
        </p>
      </div>

      {canSendEmail ? (
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Email invoice (optional)</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sends only when you click Send email. Does not change invoice status.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="invoice-email-to">To</Label>
              <Input
                id="invoice-email-to"
                type="email"
                placeholder="billing@company.example"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="invoice-email-cc">CC (optional)</Label>
              <Input
                id="invoice-email-cc"
                placeholder="ops@company.example, finance@company.example"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </div>
          </div>

          {!emailDeliveryConfigured ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Email delivery is not configured on this environment (RESEND_API_KEY
              missing). Download/print still works.
            </p>
          ) : null}

          <Button
            className="mt-4 gap-2"
            variant="outline"
            disabled={sending || !emailDeliveryConfigured}
            onClick={() => void handleSend()}
          >
            <Mail className="size-4" />
            {sending ? "Sending…" : "Send email"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
