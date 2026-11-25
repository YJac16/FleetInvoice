/**
 * U3 — workshop bill attachment route + assertMaintenanceAccess guard.
 * The service client is a small in-memory fake; storage and the RPC are spies.
 * Run: npm run test:maintenance-attachment
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const ORG_C = "c0000000-0000-4000-8000-000000000001"; // not entitled
const BILL_A = "e7500000-0000-4000-8000-0000000000a1";
const BILL_A_APPROVED = "e7500000-0000-4000-8000-0000000000a2";
const BILL_B = "e7500000-0000-4000-8000-0000000000b1";
const BILL_C = "e7500000-0000-4000-8000-0000000000c1";
const PLAN_MAINT = "p-maint";
const PLAN_CORE = "p-core";

const USERS = {
  owner: "u-owner",
  admin: "u-admin",
  manager: "u-manager",
  driver: "u-driver",
  dispatcher: "u-dispatcher",
  employee: "u-employee",
  companyManager: "u-company-manager",
  supervisor: "u-supervisor",
  inactiveAdmin: "u-inactive-admin",
  adminC: "u-admin-c",
  adminB: "u-admin-b",
} as const;

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function seed() {
  tables.profiles = [
    { id: USERS.owner, is_platform_owner: true },
    ...Object.values(USERS)
      .filter((u) => u !== USERS.owner)
      .map((id) => ({ id, is_platform_owner: false })),
  ];
  tables.organisation_members = [
    { organisation_id: ORG_A, user_id: USERS.admin, role: "organisation_admin", status: "active" },
    { organisation_id: ORG_A, user_id: USERS.manager, role: "manager", status: "active" },
    { organisation_id: ORG_A, user_id: USERS.driver, role: "driver", status: "active" },
    { organisation_id: ORG_A, user_id: USERS.dispatcher, role: "dispatcher", status: "active" },
    { organisation_id: ORG_A, user_id: USERS.employee, role: "employee", status: "active" },
    { organisation_id: ORG_A, user_id: USERS.companyManager, role: "company_manager", status: "active" },
    { organisation_id: ORG_A, user_id: USERS.supervisor, role: "supervisor", status: "active" },
    { organisation_id: ORG_A, user_id: USERS.inactiveAdmin, role: "organisation_admin", status: "inactive" },
    { organisation_id: ORG_B, user_id: USERS.adminB, role: "organisation_admin", status: "active" },
    { organisation_id: ORG_C, user_id: USERS.adminC, role: "organisation_admin", status: "active" },
  ];
  tables.subscriptions = [
    { organisation_id: ORG_A, plan_id: PLAN_MAINT, status: "active" },
    { organisation_id: ORG_B, plan_id: PLAN_MAINT, status: "trialing" },
    { organisation_id: ORG_C, plan_id: PLAN_CORE, status: "active" },
  ];
  tables.module_entitlements = [
    { plan_id: PLAN_MAINT, module_key: "maintenance" },
    { plan_id: PLAN_MAINT, module_key: "core" },
    { plan_id: PLAN_CORE, module_key: "core" },
  ];
  const bill = (id: string, org: string, extra: Row = {}) => ({
    id,
    organisation_id: org,
    status: "draft",
    attachment_path: null,
    attachment_mime: null,
    attachment_size: null,
    deleted_at: null,
    ...extra,
  });
  tables.workshop_bills = [
    bill(BILL_A, ORG_A, {
      attachment_path: `${ORG_A}/${BILL_A}/11111111-1111-4111-8111-111111111111.pdf`,
      attachment_mime: "application/pdf",
      attachment_size: 1234,
    }),
    bill(BILL_A_APPROVED, ORG_A, { status: "approved" }),
    bill(BILL_B, ORG_B),
    bill(BILL_C, ORG_C),
  ];
}

/** Minimal thenable query builder over `tables`. */
const tableCalls: string[] = [];
function query(table: string) {
  tableCalls.push(table);
  const filters: Array<(r: Row) => boolean> = [];
  let max = Infinity;
  const run = () => ({
    data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, max),
    error: null,
  });
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
    limit: (n: number) => ((max = n), b),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

const getUser = vi.fn();
const rpc = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const createSignedUrl = vi.fn();
const storageFrom = vi.fn(() => ({ upload, remove, createSignedUrl }));
let serviceAvailable = true;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() =>
    serviceAvailable ? { from: (t: string) => query(t), rpc, storage: { from: storageFrom } } : null
  ),
}));

/** Active org: explicit, else the user's first membership (like getSessionContext). */
let currentSession: Record<string, unknown> | null = null;
vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn(async () => currentSession) }));

function signIn(userId: string | null, activeOrganisationId?: string | null) {
  getUser.mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error: null });
  currentSession = userId
    ? {
        userId,
        activeOrganisationId:
          activeOrganisationId !== undefined
            ? activeOrganisationId
            : ((tables.organisation_members ?? []).find((m) => m.user_id === userId)?.organisation_id ??
              (userId === USERS.owner ? ORG_A : null)),
      }
    : null;
}

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");

function uploadRequest(billId: string, file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request(`http://localhost/api/maintenance/bills/${billId}/attachment`, {
    method: "POST",
    body: form,
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function post(billId: string, file?: File) {
  const { POST } = await import("@/app/api/maintenance/bills/[id]/attachment/route");
  const res = await POST(uploadRequest(billId, file), ctx(billId));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function get(billId: string) {
  const { GET } = await import("@/app/api/maintenance/bills/[id]/attachment/route");
  const res = await GET(new Request(`http://localhost/api/maintenance/bills/${billId}/attachment`), ctx(billId));
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}
const pdfFile = () => new File([PDF], "bill.pdf", { type: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  tableCalls.length = 0;
  currentSession = null;
  serviceAvailable = true;
  upload.mockResolvedValue({ data: {}, error: null });
  remove.mockResolvedValue({ data: [], error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/obj?token=t" }, error: null });
  rpc.mockResolvedValue({ data: null, error: null });
});

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

describe("assertMaintenanceAccess", () => {
  it.each([
    ["owner", USERS.owner],
    ["organisation_admin", USERS.admin],
    ["manager", USERS.manager],
  ])("allows %s in an entitled org (view and manage)", async (_label, userId) => {
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    for (const mode of ["view", "manage"] as const) {
      const r = await assertMaintenanceAccess(mode, { organisationId: ORG_A, userId });
      expect(r.ok).toBe(true);
    }
  });

  it.each([
    ["driver", USERS.driver],
    ["dispatcher", USERS.dispatcher],
    ["employee", USERS.employee],
    ["company_manager", USERS.companyManager],
    ["supervisor", USERS.supervisor],
  ])("forbids %s with 403", async (_label, userId) => {
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    for (const mode of ["view", "manage"] as const) {
      const r = await assertMaintenanceAccess(mode, { organisationId: ORG_A, userId });
      expect(r).toMatchObject({ ok: false, status: 403, error: "forbidden", notMember: false });
    }
  });

  it("forbids an inactive admin and flags them as not a member", async () => {
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    const r = await assertMaintenanceAccess("view", { organisationId: ORG_A, userId: USERS.inactiveAdmin });
    expect(r).toMatchObject({ ok: false, status: 403, notMember: true });
  });

  it("forbids an admin of an org without the maintenance module", async () => {
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    const r = await assertMaintenanceAccess("manage", { organisationId: ORG_C, userId: USERS.adminC });
    expect(r).toMatchObject({ ok: false, status: 403, error: "module_not_entitled" });
  });

  it("treats a cancelled subscription as not entitled", async () => {
    tables.subscriptions[0]!.status = "canceled";
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    const r = await assertMaintenanceAccess("view", { organisationId: ORG_A, userId: USERS.admin });
    expect(r).toMatchObject({ ok: false, status: 403, error: "module_not_entitled" });
  });

  it("returns 401 when nobody is signed in", async () => {
    signIn(null);
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    const r = await assertMaintenanceAccess("view", { organisationId: ORG_A });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("returns 503 when the service role is not configured", async () => {
    serviceAvailable = false;
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    const r = await assertMaintenanceAccess("view", { organisationId: ORG_A, userId: USERS.admin });
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
});

// ---------------------------------------------------------------------------
// Route guard
// ---------------------------------------------------------------------------

describe("attachment route guard", () => {
  it.each([
    ["driver", USERS.driver],
    ["dispatcher", USERS.dispatcher],
    ["employee", USERS.employee],
    ["company_manager", USERS.companyManager],
  ])("POST and GET return 403 for %s, and nothing is uploaded or signed", async (_l, userId) => {
    signIn(userId);
    expect((await post(BILL_A, pdfFile())).status).toBe(403);
    expect((await get(BILL_A)).status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("POST and GET return 403 for an admin of an unentitled org", async () => {
    signIn(USERS.adminC);
    const p = await post(BILL_C, pdfFile());
    const g = await get(BILL_C);
    expect(p).toMatchObject({ status: 403, body: { error: "module_not_entitled" } });
    expect(g).toMatchObject({ status: 403, body: { error: "module_not_entitled" } });
    expect(upload).not.toHaveBeenCalled();
  });

  it("POST and GET return 404 for another org's bill", async () => {
    signIn(USERS.admin);
    expect((await post(BILL_B, pdfFile())).status).toBe(404);
    expect((await get(BILL_B)).status).toBe(404);
    signIn(USERS.adminB);
    expect((await get(BILL_A)).status).toBe(404);
    expect(upload).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown, malformed and deleted bill ids", async () => {
    signIn(USERS.admin);
    expect((await get("e7500000-0000-4000-8000-0000000000ff")).status).toBe(404);
    expect((await get("../../etc")).status).toBe(404);
    tables.workshop_bills[0]!.deleted_at = "2026-11-01T00:00:00Z";
    expect((await get(BILL_A)).status).toBe(404);
  });

  it("returns 401 when signed out", async () => {
    signIn(null);
    expect((await post(BILL_A, pdfFile())).status).toBe(401);
    expect((await get(BILL_A)).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

describe("POST upload", () => {
  it("manager uploads a PDF to {org}/{bill}/{uuid}.pdf and calls the RPC", async () => {
    signIn(USERS.manager);
    rpc.mockResolvedValue({ data: tables.workshop_bills[0]!.attachment_path, error: null });
    const r = await post(BILL_A, pdfFile());
    expect(r).toMatchObject({ status: 200, body: { ok: true, attachment: { mime: "application/pdf", size: PDF.length } } });

    expect(storageFrom).toHaveBeenCalledWith("workshop-bills");
    const [path, , opts] = upload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${ORG_A}/${BILL_A}/[0-9a-f-]{36}\\.pdf$`));
    expect(opts).toMatchObject({ contentType: "application/pdf", upsert: false });

    expect(rpc).toHaveBeenCalledWith("set_workshop_bill_attachment", {
      p_actor: USERS.manager,
      p_org: ORG_A,
      p_bill_id: BILL_A,
      p_path: path,
      p_mime: "application/pdf",
      p_size: PDF.length,
    });
    // The old object is removed after the bill points at the new one.
    expect(remove).toHaveBeenCalledWith([`${ORG_A}/${BILL_A}/11111111-1111-4111-8111-111111111111.pdf`]);
  });

  it("platform owner can upload for the active org's bill", async () => {
    signIn(USERS.owner, ORG_B);
    const r = await post(BILL_B, new File([PNG], "scan.png", { type: "image/png" }));
    expect(r.status).toBe(200);
    expect(upload.mock.calls[0]![0]).toMatch(new RegExp(`^${ORG_B}/${BILL_B}/[0-9a-f-]{36}\\.png$`));
  });

  it("rejects an oversize file with 413 before uploading", async () => {
    signIn(USERS.admin);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PDF);
    const r = await post(BILL_A, new File([big], "big.pdf", { type: "application/pdf" }));
    expect(r).toMatchObject({ status: 413, body: { error: "file_too_large" } });
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an oversize body by Content-Length before parsing", async () => {
    signIn(USERS.admin);
    const { POST } = await import("@/app/api/maintenance/bills/[id]/attachment/route");
    const req = new Request(`http://localhost/api/maintenance/bills/${BILL_A}/attachment`, {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
      body: "--x--",
    });
    const res = await POST(req, ctx(BILL_A));
    expect(res.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ["a GIF", new File([GIF], "x.gif", { type: "image/gif" })],
    ["a GIF declared as PNG", new File([GIF], "x.png", { type: "image/png" })],
    ["a PDF declared as JPEG", new File([PDF], "x.jpg", { type: "image/jpeg" })],
    ["plain text", new File(["hello"], "x.txt", { type: "text/plain" })],
    ["an HTML page declared as PDF", new File(["<html><script>1</script>"], "x.pdf", { type: "application/pdf" })],
  ])("rejects %s with 415", async (_l, file) => {
    signIn(USERS.admin);
    const r = await post(BILL_A, file);
    expect(r).toMatchObject({ status: 415, body: { error: "unsupported_media_type" } });
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a missing or empty file with 400", async () => {
    signIn(USERS.admin);
    expect((await post(BILL_A)).status).toBe(400);
    expect((await post(BILL_A, new File([], "e.pdf", { type: "application/pdf" }))).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses approved bills with 409 before uploading", async () => {
    signIn(USERS.admin);
    const r = await post(BILL_A_APPROVED, pdfFile());
    expect(r).toMatchObject({ status: 409, body: { error: "bill_approved_locked" } });
    expect(upload).not.toHaveBeenCalled();
  });

  it("deletes the uploaded file when the RPC fails", async () => {
    signIn(USERS.admin);
    rpc.mockResolvedValue({ data: null, error: { message: "bill_approved_locked" } });
    const r = await post(BILL_A, pdfFile());
    expect(r).toMatchObject({ status: 409, body: { error: "bill_approved_locked" } });
    const uploaded = upload.mock.calls[0]![0];
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([uploaded]);
  });

  it("deletes the uploaded file on an unexpected RPC error and returns 500", async () => {
    signIn(USERS.admin);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await post(BILL_A, pdfFile());
    expect(r).toMatchObject({ status: 500, body: { error: "attach_failed" } });
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0]![0]]);
  });

  it("returns 500 and skips the RPC when the upload fails", async () => {
    signIn(USERS.admin);
    upload.mockResolvedValue({ data: null, error: { message: "storage down" } });
    const r = await post(BILL_A, pdfFile());
    expect(r.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

describe("GET signed URL", () => {
  it("returns a short-lived signed URL with no-store", async () => {
    signIn(USERS.manager);
    const r = await get(BILL_A);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: "https://signed.example/obj?token=t", expires_in: 60, mime: "application/pdf" });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(storageFrom).toHaveBeenCalledWith("workshop-bills");
    expect(createSignedUrl).toHaveBeenCalledWith(`${ORG_A}/${BILL_A}/11111111-1111-4111-8111-111111111111.pdf`, 60);
  });

  it("returns 404 when the bill has no attachment", async () => {
    signIn(USERS.admin);
    const r = await get(BILL_A_APPROVED);
    expect(r).toMatchObject({ status: 404, body: { error: "no_attachment" } });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/maintenance/bills/[id] (draft-only, audited via RPC)
// ---------------------------------------------------------------------------

describe("DELETE /api/maintenance/bills/[id]", () => {
  async function del(billId: string) {
    const { DELETE } = await import("@/app/api/maintenance/bills/[id]/route");
    const res = await DELETE(new Request(`http://localhost/api/maintenance/bills/${billId}`, { method: "DELETE" }), ctx(billId));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("401s without a session", async () => {
    signIn(null);
    expect((await del(BILL_A)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("503s when the service client is missing", async () => {
    signIn(USERS.admin);
    serviceAvailable = false;
    expect((await del(BILL_A)).status).toBe(503);
  });

  it("deletes a draft bill through the RPC as the signed-in user", async () => {
    signIn(USERS.admin);
    const r = await del(BILL_A);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(rpc).toHaveBeenCalledWith("delete_workshop_bill", { p_actor: USERS.admin, p_org: ORG_A, p_id: BILL_A });
  });

  it("maps bill_not_draft from the RPC to 409", async () => {
    signIn(USERS.admin);
    rpc.mockResolvedValue({ data: null, error: { message: "bill_not_draft" } });
    expect(await del(BILL_A_APPROVED)).toEqual({ status: 409, body: { error: "bill_not_draft" } });
  });

  it("404s another org's bill and 403s a dispatcher", async () => {
    signIn(USERS.admin);
    expect((await del(BILL_B)).status).toBe(404);
    signIn(USERS.dispatcher);
    expect((await del(BILL_A)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Check order: access for the active org before any bill lookup (Demo QA6)
// ---------------------------------------------------------------------------

const UNKNOWN = "e7500000-0000-4000-8000-0000000000ff";

async function del(billId: string) {
  const { DELETE } = await import("@/app/api/maintenance/bills/[id]/route");
  const res = await DELETE(new Request(`http://localhost/api/maintenance/bills/${billId}`, { method: "DELETE" }), ctx(billId));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe.each([
  ["GET attachment", (id: string) => get(id)],
  ["POST attachment", (id: string) => post(id, pdfFile())],
  ["DELETE bill", (id: string) => del(id)],
])("%s route order", (_name, call) => {
  it.each([
    ["an unknown id", UNKNOWN],
    ["a real id", BILL_A],
  ])("dispatcher gets 403 forbidden for %s, with no bill lookup", async (_l, id) => {
    signIn(USERS.dispatcher);
    expect(await call(id)).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(tableCalls).not.toContain("workshop_bills");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("unentitled org admin gets 403 module_not_entitled for an unknown id, with no bill lookup", async () => {
    signIn(USERS.adminC);
    expect(await call(UNKNOWN)).toMatchObject({ status: 403, body: { error: "module_not_entitled" } });
    expect(tableCalls).not.toContain("workshop_bills");
  });

  it("admin gets 404 for an unknown id", async () => {
    signIn(USERS.admin);
    expect(await call(UNKNOWN)).toMatchObject({ status: 404, body: { error: "not_found" } });
  });

  it("admin gets 404 for a deleted bill", async () => {
    tables.workshop_bills[0]!.deleted_at = "2026-11-01T00:00:00Z";
    signIn(USERS.admin);
    expect(await call(BILL_A)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("admin gets 404 for another org's bill (lookup scoped to the active org)", async () => {
    signIn(USERS.admin);
    expect(await call(BILL_B)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("no active org -> 404 with no lookup", async () => {
    signIn(USERS.admin, null);
    expect(await call(BILL_A)).toMatchObject({ status: 404 });
    expect(tableCalls).not.toContain("workshop_bills");
  });

  it("active org the user isn't a member of -> 404 (notMember), no lookup", async () => {
    signIn(USERS.admin, ORG_B);
    expect(await call(BILL_B)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(tableCalls).not.toContain("workshop_bills");
  });

  it("signed out -> 401 before the service client is used", async () => {
    signIn(null);
    expect((await call(UNKNOWN)).status).toBe(401);
    expect(tableCalls).toEqual([]);
  });

  it("service client missing -> 503 after the session check", async () => {
    serviceAvailable = false;
    signIn(USERS.admin);
    expect((await call(UNKNOWN)).status).toBe(503);
  });

  it("malformed id -> 404 before the session is read", async () => {
    signIn(USERS.dispatcher);
    expect((await call("not-a-uuid")).status).toBe(404);
    expect(tableCalls).toEqual([]);
  });
});

describe("DELETE bill happy path", () => {
  it("admin deletes a draft in the active org via the RPC", async () => {
    signIn(USERS.admin);
    expect(await del(BILL_A)).toMatchObject({ status: 200, body: { ok: true } });
    expect(rpc).toHaveBeenCalledWith("delete_workshop_bill", {
      p_actor: USERS.admin,
      p_org: ORG_A,
      p_id: BILL_A,
    });
  });

  it("maps bill_not_draft to 409", async () => {
    signIn(USERS.manager);
    rpc.mockResolvedValue({ data: null, error: { message: "bill_not_draft" } });
    expect(await del(BILL_A_APPROVED)).toMatchObject({ status: 409, body: { error: "bill_not_draft" } });
  });
});
