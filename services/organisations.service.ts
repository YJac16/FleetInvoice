import { createClient } from "@/lib/supabase/client";
import { writeAuditLog } from "@/services/audit.service";
import type { Organisation } from "@/types";
import { slugify } from "@/utils/format";

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
