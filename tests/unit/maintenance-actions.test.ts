/**
 * U5: maintenance server actions (features/maintenance/actions.ts).
 * Session, access check, service client RPC and revalidatePath are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const SUPPLIER = "5a000000-0000-4000-8000-000000000001";
const BILL = "b1000000-0000-4000-8000-000000000001";

const getSessionContext = vi.fn();
const assertMaintenanceAccess = vi.fn();
const rpc = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/auth/maintenance-access", () => ({ assertMaintenanceAccess }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { saveWorkshopBillAction, createSupplierAction } = await import("@/features/maintenance/actions");

function validBill(overrides: Record<string, unknown> = {}) {
  return {
    supplier_id: SUPPLIER,
    vehicle_id: "__none__",
    bill_date: "2026-11-20",
    invoice_ref: "INV-1",
    vat_mode: "exclusive",
    vat_rate: "0",
    odometer_km: "",
    notes: "",
    lines: [{ category_id: "__none__", description: "Service", quantity: "1", unit_amount: "500", vat_applicable: true }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContext.mockResolvedValue({ userId: "u-admin", activeOrganisationId: ORG_A, isPlatformOwner: false });
  assertMaintenanceAccess.mockImplementation(async (_mode: string, input: { organisationId: string; userId: string }) => ({
    ok: true,
    mode: "manage",
    userId: input.userId,
    organisationId: input.organisationId,
    isPlatformOwner: false,
    admin: { rpc },
  }));
  rpc.mockResolvedValue({ data: BILL, error: null });
});

describe("saveWorkshopBillAction", () => {
  it("checks 'manage' for the session's org and calls the audited RPC as the user", async () => {
    const result = await saveWorkshopBillAction(null, validBill());
    expect(result).toEqual({ ok: true, id: BILL });
    expect(assertMaintenanceAccess).toHaveBeenCalledWith("manage", { organisationId: ORG_A, userId: "u-admin" });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("save_workshop_bill");
    expect(args).toMatchObject({ p_actor: "u-admin", p_org: ORG_A, p_id: null });
    expect(revalidatePath).toHaveBeenCalledWith("/maintenance/bills");
    expect(revalidatePath).toHaveBeenCalledWith(`/maintenance/bills/${BILL}`);
  });

  it("takes the org from the session, never from the input", async () => {
    await saveWorkshopBillAction(null, { ...validBill(), organisation_id: ORG_B, p_org: ORG_B });
    const [, args] = rpc.mock.calls[0]!;
    expect(args.p_org).toBe(ORG_A);
    expect(args.p_payload).not.toHaveProperty("organisation_id");
    expect(args.p_payload).not.toHaveProperty("p_org");
  });

  it("sends vat_rate 0 explicitly on edit, and a blank odometer as null", async () => {
    await saveWorkshopBillAction(BILL, validBill({ vat_rate: "0", odometer_km: "" }));
    const [, args] = rpc.mock.calls[0]!;
    expect(args.p_id).toBe(BILL);
    expect(args.p_payload.vat_rate).toBe(0);
    expect(args.p_payload.odometer_km).toBeNull();
    expect(args.p_payload.vehicle_id).toBeNull();
    expect(args.p_payload.lines[0]).toMatchObject({ category_id: null, quantity: 1, unit_amount: 500, sort_order: 1 });
  });

  it("ignores client totals", async () => {
    await saveWorkshopBillAction(null, { ...validBill(), total_incl: 1, subtotal_excl: 1, vat_amount: 0 });
    const [, args] = rpc.mock.calls[0]!;
    expect(args.p_payload).not.toHaveProperty("total_incl");
    expect(args.p_payload).not.toHaveProperty("subtotal_excl");
  });

  it("refuses without a session and calls no RPC", async () => {
    getSessionContext.mockResolvedValue(null);
    const result = await saveWorkshopBillAction(null, validBill());
    expect(result).toMatchObject({ ok: false, error: "unauthenticated" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses when the user can't manage maintenance and calls no RPC", async () => {
    assertMaintenanceAccess.mockResolvedValue({ ok: false, status: 403, error: "forbidden", notMember: false });
    const result = await saveWorkshopBillAction(null, validBill());
    expect(result).toMatchObject({ ok: false, error: "forbidden" });
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when the org isn't entitled", async () => {
    assertMaintenanceAccess.mockResolvedValue({ ok: false, status: 403, error: "module_not_entitled", notMember: false });
    expect(await saveWorkshopBillAction(null, validBill())).toMatchObject({ ok: false, error: "module_not_entitled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input and calls no RPC", async () => {
    const result = await saveWorkshopBillAction(
      null,
      validBill({ vat_rate: "", odometer_km: "12.5", lines: [{ category_id: "__none__", description: "", quantity: "0", unit_amount: "x", vat_applicable: true }] })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_input");
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["vat_rate", "odometer_km", "lines.0.description", "lines.0.quantity", "lines.0.unit_amount"])
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed bill id before touching the database", async () => {
    expect(await saveWorkshopBillAction("not-a-uuid", validBill())).toMatchObject({ ok: false, error: "not_found" });
    expect(assertMaintenanceAccess).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: "bill_approved_locked", code: "P0001" }, "bill_approved_locked", undefined],
    [{ message: "supplier_org_mismatch", code: "P0001" }, "supplier_org_mismatch", "supplier_id"],
    [{ message: "invalid_vat_rate", code: "P0001" }, "invalid_vat_rate", "vat_rate"],
    [
      { message: 'duplicate key value violates unique constraint "workshop_bills_supplier_ref_uidx"', code: "23505" },
      "duplicate_invoice_ref",
      "invoice_ref",
    ],
    [{ message: "something odd", code: "XX000" }, "save_failed", undefined],
  ])("maps RPC error %o", async (error, code, field) => {
    rpc.mockResolvedValue({ data: null, error });
    const result = await saveWorkshopBillAction(BILL, validBill());
    expect(result).toMatchObject({ ok: false, error: code });
    if (!result.ok && field) expect(result.fieldErrors).toHaveProperty(field);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createSupplierAction", () => {
  const supplier = { name: " Tyre World ", vat_number: "", contact_phone: "", email: "", notes: "" };

  it("creates an active supplier in the session's org", async () => {
    rpc.mockResolvedValue({ data: SUPPLIER, error: null });
    const result = await createSupplierAction({ ...supplier, organisation_id: ORG_B });
    expect(result).toEqual({ ok: true, id: SUPPLIER });
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("save_supplier");
    expect(args).toMatchObject({ p_actor: "u-admin", p_org: ORG_A, p_id: null });
    expect(args.p_payload).toMatchObject({ name: "Tyre World", active: true });
    expect(args.p_payload).not.toHaveProperty("organisation_id");
    expect(revalidatePath).toHaveBeenCalledWith("/maintenance/suppliers");
  });

  it("validates input", async () => {
    const result = await createSupplierAction({ ...supplier, name: " ", email: "nope" });
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
    if (!result.ok) expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["name", "email"]));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a duplicate name", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "suppliers_org_name_uidx"', code: "23505" },
    });
    const result = await createSupplierAction(supplier);
    expect(result).toMatchObject({ ok: false, error: "duplicate_supplier", fieldErrors: { name: expect.any(String) } });
  });

  it("refuses without manage access", async () => {
    assertMaintenanceAccess.mockResolvedValue({ ok: false, status: 403, error: "forbidden", notMember: true });
    expect(await createSupplierAction(supplier)).toMatchObject({ ok: false, error: "forbidden" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
