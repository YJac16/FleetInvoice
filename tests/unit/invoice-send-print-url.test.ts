import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { buildInvoicePrintUrl } from "@/lib/notifications/invoice-print-link";

const getUser = vi.fn();
const rpc = vi.fn();
const fromImpl = vi.fn();
const sendResendEmail = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://app.workops.test",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "WorkOps <billing@workops.test>",
  },
  isEmailDeliveryConfigured: () => true,
}));

vi.mock("@/lib/notifications/resend-server", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: vi.fn(async () => ({ data: null, error: null })),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: fromImpl,
    rpc,
  })),
}));

const ORG = "a0000000-0000-4000-8000-000000000001";
const INVOICE = "a0000000-0000-4000-8000-000000000099";

describe("buildInvoicePrintUrl", () => {
  it("stays on the app origin for ops and company portals", () => {
    expect(buildInvoicePrintUrl("https://app.workops.test", INVOICE, "ops")).toBe(
      `https://app.workops.test/invoices/${INVOICE}/print`
    );
    expect(buildInvoicePrintUrl("https://app.workops.test/", INVOICE, "company")).toBe(
      `https://app.workops.test/company/invoices/${INVOICE}/print`
    );
  });

  it("rejects a non-http app origin", () => {
    expect(() => buildInvoicePrintUrl("javascript:alert(1)", INVOICE, "ops")).toThrow(
      /http or https/
    );
  });
});

describe("POST /api/invoices/send print link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    sendResendEmail.mockResolvedValue(undefined);
    fromImpl.mockImplementation((table: string) => {
      const api = {
        select: vi.fn(() => api),
        eq: vi.fn(() => api),
        is: vi.fn(() => api),
        maybeSingle: vi.fn(async () => {
          if (table === "invoices") {
            return {
              data: {
                id: INVOICE,
                organisation_id: ORG,
                company_id: "a0000000-0000-4000-8000-000000000010",
                status: "issued",
                period_start: "2026-01-05",
                period_end: "2026-01-12",
                total: 100,
                issued_at: "2026-01-12T00:00:00.000Z",
                companies: { id: "co", name: "Acme", contact_email: "a@acme.test" },
              },
              error: null,
            };
          }
          if (table === "organisations") {
            return { data: { name: "Ops", settings: {} }, error: null };
          }
          return { data: null, error: null };
        }),
      };
      return api;
    });
  });

  it("ignores a javascript printUrl and emails the app origin link", async () => {
    const { POST } = await import("@/app/api/invoices/send/route");
    const res = await POST(
      new NextRequest("http://localhost/api/invoices/send", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG,
          invoiceId: INVOICE,
          to: "billing@acme.test",
          printUrl: "javascript:alert(document.domain)",
          portal: "ops",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    const html = sendResendEmail.mock.calls[0][0].html as string;
    const text = sendResendEmail.mock.calls[0][0].text as string;
    expect(html).toContain(`https://app.workops.test/invoices/${INVOICE}/print`);
    expect(html).not.toContain("javascript:");
    expect(text).not.toContain("javascript:");
  });

  it("uses the company print path when portal is company", async () => {
    const { POST } = await import("@/app/api/invoices/send/route");
    const res = await POST(
      new NextRequest("http://localhost/api/invoices/send", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG,
          invoiceId: INVOICE,
          to: "billing@acme.test",
          portal: "company",
        }),
      })
    );
    expect(res.status).toBe(200);
    const html = sendResendEmail.mock.calls[0][0].html as string;
    expect(html).toContain(
      `https://app.workops.test/company/invoices/${INVOICE}/print`
    );
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/api/invoices/send/route");
    const res = await POST(
      new NextRequest("http://localhost/api/invoices/send", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG,
          invoiceId: INVOICE,
          to: "billing@acme.test",
        }),
      })
    );
    expect(res.status).toBe(401);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("returns 403 when invoice manage access is denied", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { POST } = await import("@/app/api/invoices/send/route");
    const res = await POST(
      new NextRequest("http://localhost/api/invoices/send", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG,
          invoiceId: INVOICE,
          to: "billing@acme.test",
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
});
