import { NextResponse } from "next/server";
import { z } from "zod";

import { assertInvoiceManageAccess } from "@/lib/auth/invoice-access";
import { env, isEmailDeliveryConfigured } from "@/lib/env";
import { parseEmailList, validateEmailList } from "@/lib/notifications/email-addresses";
import { buildInvoiceEmailContent } from "@/lib/notifications/invoice-email";
import { sendResendEmail } from "@/lib/notifications/resend-server";
import { parseInvoicePrintSettings } from "@/features/invoices/lib/invoice-print-settings";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  organisationId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  to: z.string().min(1),
  cc: z.string().optional(),
  printUrl: z.string().url(),
});

export async function POST(request: Request) {
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email delivery is not configured. Set RESEND_API_KEY in the environment to send invoices.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { organisationId, invoiceId, to, cc, printUrl } = parsed.data;

  const toCheck = validateEmailList(to, { required: true });
  if (toCheck.error) {
    return NextResponse.json({ error: toCheck.error }, { status: 400 });
  }

  const ccEmails = cc ? parseEmailList(cc) : [];
  const ccCheck = validateEmailList(cc ?? "");
  if (ccCheck.error) {
    return NextResponse.json({ error: ccCheck.error }, { status: 400 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, companies:company_id (id, name, contact_email)")
    .eq("id", invoiceId)
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "void") {
    return NextResponse.json(
      { error: "Cannot email a void invoice" },
      { status: 400 }
    );
  }

  try {
    await assertInvoiceManageAccess(supabase, invoice);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden" },
      { status: 403 }
    );
  }

  const { data: organisation, error: orgError } = await supabase
    .from("organisations")
    .select("name, settings")
    .eq("id", organisationId)
    .maybeSingle();
  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  const printSettings = parseInvoicePrintSettings({
    name: organisation?.name ?? "WorkOps",
    settings: (organisation?.settings as Record<string, unknown>) ?? {},
  });

  const emailContent = buildInvoiceEmailContent({
    invoice,
    company: invoice.companies ?? null,
    supplierName: printSettings.supplier?.name ?? organisation?.name ?? "WorkOps",
    printUrl,
  });

  try {
    await sendResendEmail({
      to: toCheck.emails,
      cc: ccEmails,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send invoice email",
      },
      { status: 502 }
    );
  }

  const admin = createServiceClient();
  if (admin) {
    try {
      await admin.rpc("write_audit_log", {
        p_organisation_id: organisationId,
        p_action: "invoice.email_sent",
        p_entity_type: "invoice",
        p_entity_id: invoiceId,
        p_metadata: {
          to: toCheck.emails,
          cc: ccEmails,
          print_url: printUrl,
        },
      });
    } catch {
      // best-effort audit
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Invoice emailed to ${toCheck.emails.join(", ")}`,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
}
