import { z } from "zod";

export const uuidSchema = z.string().uuid("Invalid id");

export const nonEmptyString = (label: string) =>
  z.string().trim().min(1, `${label} is required`);

export const optionalEmail = z
  .string()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal(""));

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
