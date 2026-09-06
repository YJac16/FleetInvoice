import { createClient } from "@/lib/supabase/client";
import { writeAuditLog } from "@/services/audit.service";
import type { Organisation } from "@/types";
import { slugify } from "@/utils/format";

export const ORG_LOGOS_BUCKET = "org-logos";

export async function listOrganisations(): Promise<Organisation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisations")
    .select("*")
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Organisation[];
}

export async function createOrganisation(input: {
  name: string;
  slug?: string;
}): Promise<Organisation> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const slug = input.slug?.trim() || slugify(input.name);
  const { data, error } = await supabase
    .from("organisations")
    .insert({
      name: input.name.trim(),
      slug,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  if (user?.id) {
    const { error: memberError } = await supabase
      .from("organisation_members")
      .insert({
        organisation_id: data.id,
        user_id: user.id,
        role: "organisation_admin",
        status: "active",
        created_by: user.id,
      });
    if (memberError) {
      console.warn(memberError.message);
    }
  }

  try {
    await writeAuditLog({
      organisationId: data.id,
      action: "organisation.created",
      entityType: "organisation",
      entityId: data.id,
      metadata: { name: data.name, slug: data.slug },
    });
  } catch {
    // best-effort
  }

  return data as Organisation;
}

export async function updateOrganisation(
  id: string,
  input: Partial<
    Pick<Organisation, "name" | "slug" | "logo_url" | "status" | "settings">
  >
): Promise<Organisation> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisations")
    .update(input)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: id,
      action: "organisation.updated",
      entityType: "organisation",
      entityId: id,
      metadata: input as Record<string, unknown>,
    });
  } catch {
    // best-effort
  }

  return data as Organisation;
}

export async function softDeleteOrganisation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("organisations")
    .update({ deleted_at: new Date().toISOString(), status: "inactive" })
    .eq("id", id);
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: id,
      action: "organisation.deleted",
      entityType: "organisation",
      entityId: id,
    });
  } catch {
    // best-effort
  }
}

export async function uploadOrganisationLogo(
  organisationId: string,
  file: File
): Promise<string> {
  const supabase = createClient();

  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Image must be under 2 MB");
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : file.type === "image/svg+xml"
            ? "svg"
            : "jpg";
  const storagePath = `${organisationId}/logo.${ext}`;

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
  await updateOrganisation(organisationId, { logo_url: null });
}

export async function getOrganisation(
  id: string
): Promise<Organisation | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisations")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as Organisation | null;
}
