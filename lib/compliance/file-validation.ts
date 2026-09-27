import { createHash } from "node:crypto";

import {
  COMPLIANCE_ALLOWED_MIMES,
  COMPLIANCE_MAX_BYTES,
  COMPLIANCE_MAX_PDF_PAGES,
  type ComplianceAllowedMime,
} from "@/lib/compliance/constants";

const HEIC_SIGNATURES = [
  [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftypheic
];

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const brand = String.fromCharCode(...bytes.slice(4, 12));
  return (
    brand.startsWith("ftypheic") ||
    brand.startsWith("ftypheix") ||
    brand.startsWith("ftypmif1") ||
    brand.startsWith("ftypheif")
  );
}

function jpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function png(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function webp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function pdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

export function detectComplianceMime(bytes: Uint8Array): ComplianceAllowedMime | "heic" | null {
  if (isHeic(bytes)) return "heic";
  if (jpeg(bytes)) return "image/jpeg";
  if (png(bytes)) return "image/png";
  if (webp(bytes)) return "image/webp";
  if (pdf(bytes)) return "application/pdf";
  if (startsWith(bytes, HEIC_SIGNATURES[0]!)) return "heic";
  return null;
}

export function countPdfPages(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches?.length ?? 0;
}

export function validateComplianceFile(input: {
  bytes: Uint8Array;
  declaredMime?: string | null;
}): { ok: true; mime: ComplianceAllowedMime } | { ok: false; code: string; status: number } {
  if (input.bytes.length === 0) {
    return { ok: false, code: "empty_file", status: 400 };
  }
  if (input.bytes.length > COMPLIANCE_MAX_BYTES) {
    return { ok: false, code: "file_too_large", status: 413 };
  }

  const detected = detectComplianceMime(input.bytes);
  if (detected === "heic") {
    return { ok: false, code: "unsupported_media_type", status: 415 };
  }
  if (!detected || !COMPLIANCE_ALLOWED_MIMES.includes(detected)) {
    return { ok: false, code: "unsupported_media_type", status: 415 };
  }

  if (detected === "application/pdf") {
    const pages = countPdfPages(input.bytes);
    if (pages > COMPLIANCE_MAX_PDF_PAGES) {
      return { ok: false, code: "pdf_too_many_pages", status: 400 };
    }
  }

  return { ok: true, mime: detected };
}

export function sanitiseDisplayFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "document";
  const cleaned = base.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return cleaned || "document";
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
