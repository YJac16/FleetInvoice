import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

export const AVATARS_BUCKET = "avatars";

export async function getProfile(): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(input: {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
}): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .update(input)
    .eq("id", user.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function uploadAvatar(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

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
          : "jpg";
  const storagePath = `${user.id}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(storagePath);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  await updateProfile({ avatar_url: url });
  return url;
}

export async function getMyEmployeeRecord(organisationId: string): Promise<{
  id: string;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  phone: string | null;
  full_name: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("id, home_address, home_latitude, home_longitude, phone, full_name")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyEmployeeHome(input: {
  organisationId: string;
  homeAddress?: string | null;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("update_my_employee_home", {
    p_organisation_id: input.organisationId,
    p_home_address: input.homeAddress ?? null,
    p_home_latitude: input.homeLatitude ?? null,
    p_home_longitude: input.homeLongitude ?? null,
  });
  if (error) throw error;
}
