import { createHash } from "node:crypto";

import {
  FUEL_SLIP_ALLOWED_MIMES,
  FUEL_SLIP_MAX_BYTES,
  type FuelSlipAllowedMime,
} from "@/lib/fuel/constants";

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

export function sniffFuelSlipMime(bytes: Uint8Array): FuelSlipAllowedMime | null {
  if (jpeg(bytes)) return "image/jpeg";
  if (png(bytes)) return "image/png";
  if (webp(bytes)) return "image/webp";
  return null;
}

export function validateFuelSlipFile(input: {
  bytes: Uint8Array;
  declaredMime?: string;
}):
  | { ok: true; mime: FuelSlipAllowedMime; sha256: string }
  | { ok: false; code: string; status: number } {
  if (input.bytes.length > FUEL_SLIP_MAX_BYTES) {
    return { ok: false, code: "file_too_large", status: 400 };
  }
  const mime = sniffFuelSlipMime(input.bytes);
  if (!mime) {
    return { ok: false, code: "invalid_file_type", status: 400 };
  }
  if (
    input.declaredMime &&
    !FUEL_SLIP_ALLOWED_MIMES.includes(input.declaredMime as FuelSlipAllowedMime)
  ) {
    return { ok: false, code: "invalid_file_type", status: 400 };
  }
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  return { ok: true, mime, sha256 };
}
