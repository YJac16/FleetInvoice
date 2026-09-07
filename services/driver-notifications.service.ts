import { createClient } from "@/lib/supabase/client";
import type { DriverInboxNotification } from "@/types";

export async function listMyDriverNotifications(
  organisationId: string
): Promise<DriverInboxNotification[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: driverRow } = await supabase
    .from("drivers")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!driverRow) return [];

  const { data, error } = await supabase
    .from("driver_inbox_notifications")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("driver_id", (driverRow as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as DriverInboxNotification[]) ?? [];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_driver_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export function unreadCount(notifications: DriverInboxNotification[]): number {
  return notifications.filter((n) => !n.read_at).length;
}
