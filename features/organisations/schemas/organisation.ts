import { z } from "zod";

export const organisationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z.string().optional(),
});

export type OrganisationValues = z.infer<typeof organisationSchema>;
