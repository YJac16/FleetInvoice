import type { AppRole } from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/constants";
import { env } from "@/lib/env";
import { buildInvitationEmail } from "@/lib/notifications/invitation-email";
import { createClient } from "@/lib/supabase/client";
import { writeAuditLog } from "@/services/audit.service";
import { enqueueNotification } from "@/services/notifications.service";
import type { Invitation, OrganisationMember } from "@/types";

export async function listMembers(
  organisationId: string
): Promise<OrganisationMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisation_members")
    .select(
      "*, profiles:user_id (id, email, full_name, avatar_url, phone)"
    )
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrganisationMember[];
}

export async function updateMemberRole(
  memberId: string,
  role: AppRole
): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisation_members")
    .update({ role })
    .eq("id", memberId)
    .select("id, organisation_id")
    .single();
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: data.organisation_id,
      action: "member.role_updated",
      entityType: "organisation_member",
      entityId: memberId,
      metadata: { role },
    });
  } catch {
    // Audit is best-effort; never block the primary mutation.
  }
}

export async function suspendMember(memberId: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisation_members")
    .update({ status: "suspended" })
    .eq("id", memberId)
    .select("id, organisation_id")
    .single();
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: data.organisation_id,
      action: "member.suspended",
      entityType: "organisation_member",
      entityId: memberId,
    });
  } catch {
    // best-effort
  }
}

export async function activateMember(memberId: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisation_members")
    .update({ status: "active" })
    .eq("id", memberId)
    .select("id, organisation_id")
    .single();
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: data.organisation_id,
      action: "member.activated",
      entityType: "organisation_member",
      entityId: memberId,
    });
  } catch {
    // best-effort
  }
}

export async function listInvitations(
  organisationId: string
): Promise<Invitation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invitation[];
}

export async function createInvitation(input: {
  organisationId: string;
  email: string;
  role: AppRole;
}): Promise<Invitation & { inviteUrl: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_organisation_id: input.organisationId,
    p_email: input.email,
    p_role: input.role,
  });
  if (error) throw error;

  const row = data as Invitation;
  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${row.token}`;

  const { data: org } = await supabase
    .from("organisations")
    .select("name")
    .eq("id", input.organisationId)
    .maybeSingle();

  const organisationName = org?.name ?? "your organisation";
  const roleLabel = ROLE_LABELS[input.role] ?? input.role;
  const emailContent = buildInvitationEmail({
    organisationName,
    inviteUrl,
    roleLabel,
  });

  try {
    await enqueueNotification({
      organisationId: input.organisationId,
      channel: "email",
      recipient: input.email,
      subject: emailContent.subject,
      body: emailContent.body,
      templateKey: "invitation",
      payload: {
        invitation_id: row.id,
        invite_url: inviteUrl,
        role: input.role,
      },
    });
  } catch {
    // Invite row exists; email enqueue is best-effort.
  }

  try {
    await writeAuditLog({
      organisationId: input.organisationId,
      action: "invitation.created",
      entityType: "invitation",
      entityId: row.id,
      metadata: { email: input.email, role: input.role },
    });
  } catch {
    // best-effort
  }

  return { ...row, inviteUrl };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .select("id, organisation_id")
    .single();
  if (error) throw error;

  try {
    await writeAuditLog({
      organisationId: data.organisation_id,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invitationId,
    });
  } catch {
    // best-effort
  }
}
