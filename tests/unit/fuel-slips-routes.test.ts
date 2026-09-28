import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const rpc = vi.fn();
const storageRemove = vi.fn();
const storageUpload = vi.fn();
const createSignedUrl = vi.fn();
const fromChain = vi.fn();
const processPurgeQueue = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: fromChain,
  })),
}));

vi.mock("@/services/fuel-slips.server", () => ({
  resolveFuelIsPlatformOwner: vi.fn().mockResolvedValue(false),
  resolveFuelSlipAuth: vi.fn().mockResolvedValue({
    ok: true,
    ctx: {
      userId: "driver-user",
      organisationId: "a0000000-0000-4000-8000-000000000001",
      role: "driver",
      isPlatformOwner: false,
      driverId: "a0000000-0000-4000-8000-000000000201",
    },
  }),
  buildFuelSlipStoragePath: vi.fn(() => "org/fillups/2026/09/x/y.jpg"),
  mimeToFuelExt: vi.fn(() => "jpg"),
}));

vi.mock("@/lib/compliance/process-storage-purge-queue", () => ({
  processComplianceStoragePurgeQueue: (...args: unknown[]) => processPurgeQueue(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: storageUpload,
        remove: storageRemove,
        createSignedUrl,
      })),
    },
    rpc,
    from: fromChain,
  })),
}));

const ORG = "a0000000-0000-4000-8000-000000000001";
const PHOTO_ID = "a0000000-0000-4000-8000-000000000301";
function jpegForm(extra: Record<string, string> = {}) {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const form = new FormData();
  form.set("organisation_id", ORG);
  form.set("photo", new File([jpeg], "slip.jpg", { type: "image/jpeg" }));
  form.set("filled_at_local_date", "2026-09-28");
  form.set("filled_at_local_time", "10:00");
  form.set("vehicle_id", "a0000000-0000-4000-8000-000000000101");
  form.set("litres", "36.51");
  form.set("unit_price", "26.05");
  form.set("total_amount", "951.10");
  form.set("fuel_type", "ulp95");
  form.set("slip_vrn_status", "confirmed_prefill");
  form.set("odometer_km", "68000");
  form.set("station_name", "Test Station");
  form.set("client_entry_id", "c0000000-0000-4000-8000-000000000401");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return form;
}

const photoRow = {
  id: PHOTO_ID,
  organisation_id: ORG,
  storage_path: "org/fillups/x.jpg",
  purged_at: null,
};

function mockPhotoSelect(data: typeof photoRow | null) {
  fromChain.mockImplementation((table: string) => {
    const base = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
    if (table === "fuel_slip_photos") {
      base.maybeSingle.mockResolvedValue({ data, error: null });
    } else {
      base.maybeSingle.mockResolvedValue({ data: null, error: null });
    }
    return base;
  });
}

describe("fuel slip API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FUEL_SLIP_CAPTURE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_FUEL_SLIP_CAPTURE_ENABLED", "true");
    storageUpload.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: "driver-user" } }, error: null });
    processPurgeQueue.mockResolvedValue({ processed: 0, removed: 0, failed: 0 });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.test/signed" },
      error: null,
    });
  });

  it("returns 404 when FUEL_SLIP_CAPTURE_ENABLED is off", async () => {
    vi.stubEnv("FUEL_SLIP_CAPTURE_ENABLED", "false");
    const { POST } = await import("@/app/api/fuel/slips/route");
    const res = await POST(
      new Request("http://localhost/api/fuel/slips", { method: "POST", body: jpegForm() })
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("feature_disabled");
  });

  it("removes uploaded object when submit RPC fails", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "submit_fuel_slip") {
        return Promise.resolve({ data: null, error: { message: "vehicle_not_found" } });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const { POST } = await import("@/app/api/fuel/slips/route");
    const res = await POST(
      new Request("http://localhost/api/fuel/slips", { method: "POST", body: jpegForm() })
    );
    expect(res.status).toBe(500);
    expect(storageRemove).toHaveBeenCalledWith(["org/fillups/2026/09/x/y.jpg"]);
    expect(processPurgeQueue).not.toHaveBeenCalled();
  });

  it("returns success when purge queue processing fails after submit", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "submit_fuel_slip") {
        return Promise.resolve({ data: { id: "fillup-1" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    processPurgeQueue.mockRejectedValue(new Error("queue fetch failed"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/fuel/slips/route");
    const res = await POST(
      new Request("http://localhost/api/fuel/slips", { method: "POST", body: jpegForm() })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("strips unknown form fields before RPC (no flag injection via route)", async () => {
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === "submit_fuel_slip") {
        const fields = args.p_fields as Record<string, unknown>;
        expect(fields.open_flag_count).toBeUndefined();
        expect(fields.max_open_severity).toBeUndefined();
        return Promise.resolve({ data: { id: "fillup-1" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const { POST } = await import("@/app/api/fuel/slips/route");
    const res = await POST(
      new Request("http://localhost/api/fuel/slips", {
        method: "POST",
        body: jpegForm({ open_flag_count: "0", max_open_severity: "high" }),
      })
    );
    expect(res.status).toBe(200);
  });

  describe("photo view route authorization matrix", () => {
    const cases: {
      label: string;
      visible: boolean;
      auditOk: boolean;
      expectStatus: number;
    }[] = [
      { label: "driver-own", visible: true, auditOk: true, expectStatus: 302 },
      { label: "driver-other-rls", visible: false, auditOk: true, expectStatus: 404 },
      { label: "manager-f1-rls", visible: false, auditOk: true, expectStatus: 404 },
      { label: "dispatcher-f1-rls", visible: false, auditOk: true, expectStatus: 404 },
      { label: "supervisor-f1-rls", visible: false, auditOk: true, expectStatus: 404 },
      { label: "company-manager-rls", visible: false, auditOk: true, expectStatus: 404 },
      { label: "employee-rls", visible: false, auditOk: true, expectStatus: 404 },
      { label: "org-admin", visible: true, auditOk: true, expectStatus: 302 },
      { label: "platform-owner", visible: true, auditOk: true, expectStatus: 302 },
      { label: "cross-org-rls", visible: false, auditOk: true, expectStatus: 404 },
      { label: "driver-other-audit-deny", visible: true, auditOk: false, expectStatus: 500 },
    ];

    it.each(cases)("$label", async ({ visible, auditOk, expectStatus }) => {
      getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
      mockPhotoSelect(visible ? photoRow : null);
      rpc.mockImplementation((name: string) => {
        if (name === "audit_fuel_slip_photo_view") {
          return auditOk
            ? Promise.resolve({ data: {}, error: null })
            : Promise.resolve({ data: null, error: { message: "not_authorised" } });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const { GET } = await import("@/app/api/fuel/slips/photos/[photoId]/view/route");
      const res = await GET(new NextRequest(`http://localhost/api/fuel/slips/photos/${PHOTO_ID}/view`), {
        params: Promise.resolve({ photoId: PHOTO_ID }),
      });
      expect(res.status).toBe(expectStatus);
      if (expectStatus === 302) {
        expect(createSignedUrl).toHaveBeenCalled();
      } else {
        expect(createSignedUrl).not.toHaveBeenCalled();
      }
    });
  });
});
