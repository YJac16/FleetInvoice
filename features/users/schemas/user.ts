import { z } from "zod";

import { INVITABLE_ROLES } from "@/lib/constants";

export const inviteSchema = z.object({
  email: z.email("Enter a valid email"),
  role: z.enum(INVITABLE_ROLES),
});

export type InviteValues = z.infer<typeof inviteSchema>;

export const roleSchema = z.object({
  role: z.enum(INVITABLE_ROLES),
});

export type RoleValues = z.infer<typeof roleSchema>;
