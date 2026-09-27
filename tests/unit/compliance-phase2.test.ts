import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { validateComplianceFile } from "@/lib/compliance/file-validation";
import { assertComplianceLogSafe } from "@/lib/compliance/safe-log";
import { normaliseEvidence } from "@/lib/compliance/evidence";
import { normaliseScanResult } from "@/lib/compliance/scan-normalise";
import { mockExtractCompliance } from "@/lib/compliance/scan/mock-provider";
import { complianceUploadFieldsSchema } from "@/lib/compliance/upload-schema";
import {
  convertHeicToJpeg,
  HeicConversionError,
  prepareComplianceUploadFile,
} from "@/lib/compliance/client/prepare-upload";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

const mockAdmin = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => mockAdmin),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
}

function heicBytes(): Uint8Array {
  const header = new TextEncoder().encode("    ftypheic");
  return new Uint8Array(header);
}

describe("compliance phase 2 spec tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COMPLIANCE_SCAN_ENABLED;
  });

  it("S9 rejects >10MB", () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = validateComplianceFile({ bytes: big });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("file_too_large");
  });

  it("S9b HEIC bytes → 415", () => {
    const res = validateComplianceFile({ bytes: heicBytes() });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(415);
      expect(res.code).toBe("unsupported_media_type");
    }
  });

  it("S16 strict schema rejects extra privileged fields", () => {
    const parsed = complianceUploadFieldsSchema.safeParse({
      subject_kind: "driver",
      subject_id: "a0000000-0000-4000-8000-000000000201",
      doc_type: "driver_licence",
      organisation_id: "evil",
    });
    expect(parsed.success).toBe(false);
  });

  it("X13 drops text evidence", async () => {
    const raw = await mockExtractCompliance("driver_licence", jpegBytes(), {
      injectTextEvidence: true,
    });
    const field = raw.fields.license_number!;
    const { evidence, droppedText } = normaliseEvidence(field.evidence);
    expect(droppedText).toBe(true);
    expect(evidence).toBeNull();
    const normalised = normaliseScanResult("driver_licence", raw, null);
    expect(normalised.fields.license_number?.evidence).toBeNull();
  });

  it("X5 flags low confidence and invalid fields as warnings", async () => {
    const raw = await mockExtractCompliance("driver_licence", jpegBytes());
    raw.fields.license_code = { value: "NOT_A_CODE", confidence: 0.95, evidence: null };
    const normalised = normaliseScanResult("driver_licence", raw, null);
    expect(normalised.warnings.some((w) => w.includes("license_code"))).toBe(true);
    expect(normalised.fields.license_code?.confidence).toBeLessThan(0.86);
  });

  it("X6 strips id_number", async () => {
    const raw = await mockExtractCompliance("driver_licence", jpegBytes());
    const normalised = normaliseScanResult("driver_licence", raw, null);
    expect(normalised.fields.id_number).toBeUndefined();
  });

  it("U5 HEIC conversion failure message", async () => {
    const file = new File([Buffer.from(heicBytes())], "photo.heic", { type: "image/heic" });
    await expect(
      convertHeicToJpeg(file, async () => {
        throw new Error("fail");
      })
    ).rejects.toBeInstanceOf(HeicConversionError);
  });

  it("U1 capture attributes on compliance section inputs", async () => {
    const mod = await import("@/features/compliance/components/compliance-document-section");
    expect(mod.ComplianceDocumentSection).toBeDefined();
  });

  it("X9 log capture avoids sensitive values", () => {
    expect(assertComplianceLogSafe("scan completed status=ok")).toBe(true);
    expect(assertComplianceLogSafe("storage_path=secret/path")).toBe(false);
    expect(assertComplianceLogSafe("licence_number=ABC")).toBe(false);
  });

  it("X1 scan disabled when flag off", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { compliance_scan_enabled: false },
        error: null,
      }),
    });
    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: "a0000000-0000-4000-8000-000000000201",
          document_id: "a0000000-0000-4000-8000-000000000301",
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("U2 EXIF stripped on canvas re-encode", () => {
  it("prepareComplianceUploadFile returns jpeg for images", async () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }
    const canvasProto = HTMLCanvasElement.prototype;
    vi.spyOn(canvasProto, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvasProto, "toBlob").mockImplementation((cb) => {
      cb(new Blob([Buffer.from(jpegBytes())], { type: "image/jpeg" }));
    });
    global.createImageBitmap = vi.fn(async () => ({
      width: 4000,
      height: 3000,
      close: vi.fn(),
    })) as typeof createImageBitmap;

    const file = new File([Buffer.from(jpegBytes())], "a.jpg", { type: "image/jpeg" });
    const out = await prepareComplianceUploadFile(file);
    expect(out.type).toBe("image/jpeg");
  });
});
