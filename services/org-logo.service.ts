import { createClient } from "@/lib/supabase/client";
import { updateOrganisation } from "@/services/organisations.service";

export const ORG_LOGOS_BUCKET = "org-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function buildOrgLogoStoragePath(
  organisationId: string,
  mimeType: string
): string {
  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : "jpg";
  return `${organisationId}/logo.${ext}`;
}

export function validateOrgLogoFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Image must be under 2 MB");
  }
}

export async function uploadOrganisationLogo(
  organisationId: string,
  file: File
): Promise<string> {
  validateOrgLogoFile(file);

  const supabase = createClient();
  const storagePath = buildOrgLogoStoragePath(organisationId, file.type);

  const { error } = await supabase.storage
    .from(ORG_LOGOS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage
    .from(ORG_LOGOS_BUCKET)
    .getPublicUrl(storagePath);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  await updateOrganisation(organisationId, { logo_url: url });
  return url;
}

export async function removeOrganisationLogo(
  organisationId: string
): Promise<void> {
  const supabase = createClient();
  const { data: files, error: listError } = await supabase.storage
    .from(ORG_LOGOS_BUCKET)
    .list(organisationId);
  if (listError) throw listError;

  if (files?.length) {
    const paths = files.map((file: { name: string }) => `${organisationId}/${file.name}`);
    const { error: removeError } = await supabase.storage
      .from(ORG_LOGOS_BUCKET)
      .remove(paths);
    if (removeError) throw removeError;
  }

  await updateOrganisation(organisationId, { logo_url: null });
}
