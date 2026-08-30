import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email"),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const acceptInviteSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AcceptInviteValues = z.infer<typeof acceptInviteSchema>;
