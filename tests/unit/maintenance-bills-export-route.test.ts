/**
 * U6: GET /api/maintenance/bills/export. Session, guard and query are mocked;
 * the CSV builder is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const VEHICLE = "c0000000-0000-4000-8000-000000000001";
const SUPPLIER = "d0000000-0000-4000-8000-000000000001";

const getSessionContext = vi.fn();
const assertMaintenanceAccess = vi.fn();
const listBillLinesForExport = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/auth/maintenance-access", () => ({ assertMaintenanceAccess }));
vi.mock("@/features/maintenance/lib/queries", () => ({ listBillLinesForExport }));

const LINE = {
  bill_date: "2026-11-20",
  supplier_name: "=cmd",
  supplier_vat_number: "4123456789",
  invoice_ref: "INV-1",
  vehicle_label: null,
  category_name: "Service",
  description: "Oil, filter",
  quantity: "1.000",
  unit_amount: "800.00",
  line_excl: "800.00",
  line_vat: "120.00",
  line_incl: "920.00",
  vat_mode: "exclusive",
  vat_rate: "15.00",
  status: "draft",
};

async function get(query: string) {
  const { GET } = await import("@/app/api/maintenance/bills/export/route");
  return GET(new Request(`http://localhost/api/maintenance/bills/export?${query}`));
}

const RANGE = "from=2026-11-01&to=2026-11-23";

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContext.mockResolvedValue({ userId: "u1", activeOrganisationId: ORG_A });
  assertMaintenanceAccess.mockResolvedValue({
    ok: true,
    mode: "view",
    userId: "u1",
    organisationId: ORG_A,
    isPlatformOwner: false,
    admin: {},
  });
  listBillLinesForExport.mockResolvedValue({ ok: true, rows: [LINE] });
});

describe("bills export route: access", () => {
  it("401 without a session", async () => {
    getSessionContext.mockResolvedValue(null);
    const res = await get(RANGE);
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(assertMaintenanceAccess).not.toHaveBeenCalled();
    expect(listBillLinesForExport).not.toHaveBeenCalled();
  });

  it("403 without an active organisation", async () => {
    getSessionContext.mockResolvedValue({ userId: "u1", activeOrganisationId: null });
    const res = await get(RANGE);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no_active_org" });
    expect(listBillLinesForExport).not.toHaveBeenCalled();
  });

  it("checks maintenance 'view' for the session org", async () => {
    await get(RANGE);
    expect(assertMaintenanceAccess).toHaveBeenCalledWith("view", { organisationId: ORG_A, userId: "u1" });
  });

  it.each([
    [403, "forbidden"],
    [403, "module_not_entitled"],
    [503, "service_unavailable"],
    [401, "unauthenticated"],
  ] as const)("passes a %s %s denial through without reading data", async (status, error) => {
    assertMaintenanceAccess.mockResolvedValue({ ok: false, status, error, notMember: false });
    const res = await get(RANGE);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(listBillLinesForExport).not.toHaveBeenCalled();
  });

  it("ignores an organisation id in the query string", async () => {
    await get(`${RANGE}&organisation_id=${ORG_B}&org=${ORG_B}`);
    expect(assertMaintenanceAccess).toHaveBeenCalledWith("view", { organisationId: ORG_A, userId: "u1" });
    expect(listBillLinesForExport).toHaveBeenCalledWith(ORG_A, { from: "2026-11-01", to: "2026-11-23" });
  });
});

describe("bills export route: filters", () => {
  it.each(["", "from=2026-11-01", "from=2026-11-30&to=2026-11-01", "from=2025-01-01&to=2026-11-23", `${RANGE}&vehicle=x`])(
    "400 for invalid filters %j",
    async (q) => {
      const res = await get(q);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_filters");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(listBillLinesForExport).not.toHaveBeenCalled();
    }
  );

  it("forwards vehicle and supplier", async () => {
    await get(`${RANGE}&vehicle=${VEHICLE}&supplier=${SUPPLIER}`);
    expect(listBillLinesForExport).toHaveBeenCalledWith(ORG_A, {
      from: "2026-11-01",
      to: "2026-11-23",
      vehicleId: VEHICLE,
      supplierId: SUPPLIER,
    });
  });

  it("422 when the range has too many lines", async () => {
    listBillLinesForExport.mockResolvedValue({ ok: false, error: "too_many_rows" });
    const res = await get(RANGE);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "too_many_rows" });
  });
});

describe("bills export route: response", () => {
  it("returns an uncached CSV attachment with BOM and safe cells", async () => {
    const res = await get(RANGE);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="workshop-bills_2026-11-01_2026-11-23.csv"'
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes.slice(3));
    const [header, line] = text.split("\r\n");
    expect(header.startsWith("Bill date,Supplier,Supplier VAT no.,")).toBe(true);
    expect(line).toBe(
      `2026-11-20,'=cmd,4123456789,INV-1,,Service,"Oil, filter",1,800.00,800.00,120.00,920.00,exclusive,15.00,Draft`
    );
  });
});
