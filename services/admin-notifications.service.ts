import { createClient } from "@/lib/supabase/client";

export type AdminInboxNotification = {
  id: string;
  organisation_id: string;
  recipient_user_id: string;
  notification_type: string;
  title: string;
  body: string;
  link_path: string | null;
  subject_kind: string | null;
  subject_id: string | null;
  read_at: string | null;
  created_at: string;
};

export async function listMyAdminNotifications(
  organisationId: string
): Promise<AdminInboxNotification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("admin_inbox_notifications")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AdminInboxNotification[];
}

export function adminUnreadCount(items: AdminInboxNotification[]): number {
  return items.filter((n) => !n.read_at).length;
}

export async function markAdminNotificationRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_admin_notification_read", {
    p_id: id,
  });
  if (error) throw error;
}
