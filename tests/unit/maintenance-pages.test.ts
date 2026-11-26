/**
 * U5: server pages under app/(dashboard)/maintenance. They check access
 * themselves (not only via the layout), 404 for missing or other-org bills,
 * and never offer an edit form for an approved bill.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const BILL = "b1000000-0000-4000-8000-000000000001";

const getSessionContext = vi.fn();
const assertMaintenanceAccess = vi.fn();
const assertMaintenanceAdminAccess = vi.fn(async () => ({
  ok: false,
  status: 403,
  error: "forbidden",
  notMember: false,
}));
const getBill = vi.fn();
const getBillFormOptions = vi.fn();
const listBills = vi.fn();
const listSuppliers = vi.fn();
const getExportFilterOptions = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/auth/maintenance-access", () => ({ assertMaintenanceAccess, assertMaintenanceAdminAccess }));
vi.mock("@/features/maintenance/lib/insights-queries", () => ({
  getLastPaidIndex: vi.fn(async () => ({})),
}));
vi.mock("@/features/maintenance/lib/queries", () => ({
  getBill,
  getBillFormOptions,
  getExportFilterOptions,
  listBills,
  listSuppliers,
}));

function allow(view: boolean, manage: boolean) {
  assertMaintenanceAccess.mockImplementation(async (mode: string) =>
    (mode === "view" ? view : manage)
      ? { ok: true, mode, userId: "u1", organisationId: ORG_A, isPlatformOwner: false, admin: {} }
      : { ok: false, status: 403, error: "forbidden", notMember: false }
  );
}

function draft(status: "draft" | "approved" = "draft") {
  return {
    id: BILL,
    supplier_id: "s1",
    supplier_name: "Tyre World",
    vehicle_id: null,
    vehicle_label: null,
    bill_date: "2026-11-20",
    invoice_ref: "INV-1",
    vat_mode: "exclusive",
    vat_rate: 0,
    subtotal_excl: 0,
    vat_amount: 0,
    total_incl: 0,
    status,
    odometer_km: null,
    notes: null,
    has_attachment: false,
    attachment_mime: null,
    attachment_size: null,
    lines: [],
  };
}

const params = Promise.resolve({ id: BILL });

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContext.mockResolvedValue({ userId: "u1", activeOrganisationId: ORG_A, isPlatformOwner: false });
  allow(true, true);
  getBillFormOptions.mockResolvedValue({ suppliers: [], categories: [], vehicles: [] });
  listBills.mockResolvedValue([]);
  listSuppliers.mockResolvedValue([]);
  getExportFilterOptions.mockResolvedValue({ suppliers: [], vehicles: [] });
});

describe("getMaintenancePageContext", () => {
  async function ctx(mode: "view" | "manage") {
    const { getMaintenancePageContext } = await import("@/features/maintenance/lib/page-context");
    return getMaintenancePageContext(mode);
  }

  it("redirects to /login without a session", async () => {
    getSessionContext.mockResolvedValue(null);
    await expect(ctx("view")).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("404s without an active org", async () => {
    getSessionContext.mockResolvedValue({ userId: "u1", activeOrganisationId: null });
    await expect(ctx("view")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s a view page for a user without view access", async () => {
    allow(false, false);
    await expect(ctx("view")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets a view-only user see the page without write controls", async () => {
    allow(true, false);
    await expect(ctx("view")).resolves.toMatchObject({ organisationId: ORG_A, canManage: false });
  });

  it("404s a manage page for a view-only user", async () => {
    allow(true, false);
    await expect(ctx("manage")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("checks access for the session's active org", async () => {
    await ctx("view");
    expect(assertMaintenanceAccess).toHaveBeenCalledWith("view", { organisationId: ORG_A, userId: "u1" });
    expect(assertMaintenanceAccess).toHaveBeenCalledWith("manage", { organisationId: ORG_A, userId: "u1" });
  });

  it("redirects a missing service role to /app/unavailable, not a 404", async () => {
    assertMaintenanceAccess.mockResolvedValue({ ok: false, status: 503, error: "service_unavailable", notMember: false });
    await expect(ctx("view")).rejects.toThrow("NEXT_REDIRECT:/app/unavailable");
  });
});

describe("bill pages", () => {
  it("/maintenance redirects to the bills list", async () => {
    const { default: Page } = await import("@/app/(dashboard)/maintenance/page");
    expect(() => Page()).toThrow("NEXT_REDIRECT:/maintenance/bills");
  });

  it("detail 404s for a bill that isn't in the active org", async () => {
    getBill.mockResolvedValue(null);
    const { default: Page } = await import("@/app/(dashboard)/maintenance/bills/[id]/page");
    await expect(Page({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getBill).toHaveBeenCalledWith(ORG_A, BILL);
  });

  it("detail renders a bill from the active org", async () => {
    getBill.mockResolvedValue(draft());
    const { default: Page } = await import("@/app/(dashboard)/maintenance/bills/[id]/page");
    await expect(Page({ params })).resolves.toBeTruthy();
  });

  async function renderDetail(status: "draft" | "approved", manage = true) {
    allow(true, manage);
    getBill.mockResolvedValue(draft(status));
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Page } = await import("@/app/(dashboard)/maintenance/bills/[id]/page");
    return renderToStaticMarkup(await Page({ params }));
  }

  it("detail shows Finalise, Edit and Delete for a draft (manager)", async () => {
    const html = await renderDetail("draft");
    expect(html).toContain("Finalise");
    expect(html).toContain("Edit");
    expect(html).toContain("Delete");
    expect(html).toContain("Draft");
  });

  it("detail shows a Final badge and no Edit/Delete/Upload/Finalise for a final bill", async () => {
    const html = await renderDetail("approved");
    expect(html).toContain("Final");
    expect(html).not.toContain("Approved");
    expect(html).not.toMatch(/Finalise|Edit|Delete|Upload/);
  });

  it("detail hides Finalise from a view-only user", async () => {
    const html = await renderDetail("draft", false);
    expect(html).not.toMatch(/Finalise|Delete/);
  });

  it("edit redirects an approved bill to its detail page", async () => {
    getBill.mockResolvedValue(draft("approved"));
    const { default: Page } = await import("@/app/(dashboard)/maintenance/bills/[id]/edit/page");
    await expect(Page({ params })).rejects.toThrow(`NEXT_REDIRECT:/maintenance/bills/${BILL}`);
    expect(getBillFormOptions).not.toHaveBeenCalled();
  });

  it("edit 404s for a view-only user before loading the bill", async () => {
    allow(true, false);
    const { default: Page } = await import("@/app/(dashboard)/maintenance/bills/[id]/edit/page");
    await expect(Page({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getBill).not.toHaveBeenCalled();
  });

  it("edit keeps the bill's current supplier and categories in the options", async () => {
    const line = { id: "l", description: "x", quantity: 1, unit_amount: 1, vat_applicable: true, line_excl: 1, line_vat: 0, line_incl: 1, category_name: null };
    getBill.mockResolvedValue({
      ...draft(),
      lines: [
        { ...line, id: "l1", category_id: "c1", sort_order: 1 },
        { ...line, id: "l2", category_id: null, sort_order: 2 },
      ],
    });
    const { default: Page } = await import("@/app/(dashboard)/maintenance/bills/[id]/edit/page");
    await Page({ params });
    expect(getBillFormOptions).toHaveBeenCalledWith(ORG_A, { supplierId: "s1", categoryIds: ["c1", null] });
  });

  it("new 404s for a view-only user", async () => {
    allow(true, false);
    const { default: Page } = await import("@/app/(dashboard)/maintenance/bills/new/page");
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getBillFormOptions).not.toHaveBeenCalled();
  });

  it("list and suppliers pages load data for the active org only", async () => {
    const { default: Bills } = await import("@/app/(dashboard)/maintenance/bills/page");
    const { default: Suppliers } = await import("@/app/(dashboard)/maintenance/suppliers/page");
    await Bills();
    await Suppliers();
    expect(listBills).toHaveBeenCalledWith(ORG_A);
    expect(getExportFilterOptions).toHaveBeenCalledWith(ORG_A);
    expect(listSuppliers).toHaveBeenCalledWith(ORG_A);
  });
});
