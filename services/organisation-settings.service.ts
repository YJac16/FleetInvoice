import { createClient } from "@/lib/supabase/client";

/** Read-only: settings JSON of one organisation the caller is a member of. */
export async function getOrganisationSettings(
  organisationId: string
): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", organisationId)
    .maybeSingle();
  if (error) throw error;
  const settings = (data as { settings?: unknown } | null)?.settings;
  return settings && typeof settings === "object"
    ? (settings as Record<string, unknown>)
    : {};
}
