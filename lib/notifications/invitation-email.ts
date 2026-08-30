import type { Invitation } from "@/types";

export function buildInvitationEmail(input: {
  organisationName: string;
  inviteUrl: string;
  roleLabel: string;
}): { subject: string; body: string } {
  const subject = `You're invited to ${input.organisationName} on WorkOps`;
  const body = [
    `You have been invited to join ${input.organisationName} as ${input.roleLabel}.`,
    "",
    "Accept your invitation:",
    input.inviteUrl,
    "",
    "This link expires in 7 days. If you did not expect this email, you can ignore it.",
  ].join("\n");

  return { subject, body };
}

export type InvitationEmailContext = {
  invitation: Invitation;
  organisationName: string;
  roleLabel: string;
  inviteUrl: string;
};
