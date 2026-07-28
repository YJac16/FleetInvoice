import { createClient } from "@/lib/supabase/client";
import type { WhiteLabelConfig } from "@/types";

export async function listWhiteLabelConfigs(): Promise<
  (WhiteLabelConfig & {
    organisations?: { id: string; name: string; slug: string } | null;
  })[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("white_label_configs")
    .select("*, organisations:organisation_id (id, name, slug)")
    .order("hostname", { ascending: true });
  if (error) throw error;
  return (data ?? []) as (WhiteLabelConfig & {
    organisations?: { id: string; name: string; slug: string } | null;
  })[];
}

export async function upsertWhiteLabelConfig(input: {
  organisation_id: string;
  hostname: string;
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
}): Promise<WhiteLabelConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("white_label_configs")
    .upsert(
      {
        ...input,
        hostname: input.hostname.toLowerCase().trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as WhiteLabelConfig;
}

export async function deleteWhiteLabelConfig(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("white_label_configs")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function lookupWhiteLabelByHostname(hostname: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("lookup_white_label", {
    p_hostname: hostname.toLowerCase(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as {
    organisation_id: string;
    logo_url: string | null;
    primary_color: string | null;
    accent_color: string | null;
  } | null) ?? null;
}
