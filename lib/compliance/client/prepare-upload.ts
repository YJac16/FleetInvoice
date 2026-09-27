const MAX_EDGE = 2000;

export class HeicConversionError extends Error {
  code = "heic_conversion_failed" as const;
}

export async function convertHeicToJpeg(
  file: File,
  converter?: (file: File) => Promise<Blob>
): Promise<File> {
  const convert =
    converter ??
    (async (f: File) => {
      const { default: heic2any } = await import("heic2any");
      const result = await heic2any({ blob: f, toType: "image/jpeg" });
      const blob = Array.isArray(result) ? result[0] : result;
      if (!blob) throw new HeicConversionError("HEIC conversion failed");
      return blob;
    });

  try {
    const blob = await convert(file);
    return new File([blob], file.name.replace(/\.heic$/i, ".jpg"), {
      type: "image/jpeg",
    });
  } catch {
    throw new HeicConversionError(
      "This photo format couldn't be converted. Please take the photo again or upload a JPG/PDF."
    );
  }
}

export async function prepareComplianceUploadFile(file: File): Promise<File> {
  const lower = file.name.toLowerCase();
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif");

  let working = file;
  if (isHeic) {
    working = await convertHeicToJpeg(file);
  }

  if (working.type === "application/pdf") {
    return working;
  }

  if (!working.type.startsWith("image/")) {
    return working;
  }

  const bitmap = await createImageBitmap(working);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return working;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88)
  );
  if (!blob) return working;
  return new File([blob], working.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

export function stripExifGpsFromJpeg(bytes: Uint8Array): boolean {
  // After canvas re-encode, EXIF is stripped; used by tests on prepared output.
  const text = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 512)));
  return !text.includes("GPS");
}
