import { z } from "zod";

import { LICENSE_CODES } from "@/features/compliance/lib/compliance-status";
import { ENTITY_STATUSES } from "@/lib/constants";

const optionalDate = z.string().optional();

export const driverSchema = z
  .object({
    full_name: z.string().min(2, "Full name is required"),
    email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
    phone: z.string().optional(),
    license_number: z.string().optional(),
    license_code: z.union([z.enum(LICENSE_CODES), z.literal("")]).optional(),
    license_code_other: z.string().optional(),
    license_expires_on: optionalDate,
    pdp_number: z.string().optional(),
    pdp_expires_on: optionalDate,
    profile_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    status: z.enum(ENTITY_STATUSES),
  })
  .superRefine((values, ctx) => {
    const code = values.license_code?.trim() || null;
    const other = values.license_code_other?.trim() || "";
    if (code === "Other") {
      if (other.length < 2 || other.length > 60) {
        ctx.addIssue({
          code: "custom",
          message: "Explain licence code (2–60 characters)",
          path: ["license_code_other"],
        });
      }
    } else if (other) {
      ctx.addIssue({
        code: "custom",
        message: "Explanation only allowed when code is Other",
        path: ["license_code_other"],
      });
    }
  });

export type DriverValues = z.infer<typeof driverSchema>;
