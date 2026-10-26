import { z } from "zod";

const emptyToUndefined = (value: string | undefined) => {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NOTIFICATIONS_PROCESS_SECRET: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyToUndefined(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  NEXT_PUBLIC_APP_URL: emptyToUndefined(process.env.NEXT_PUBLIC_APP_URL),
  SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  NOTIFICATIONS_PROCESS_SECRET: emptyToUndefined(
    process.env.NOTIFICATIONS_PROCESS_SECRET
  ),
  CRON_SECRET: emptyToUndefined(process.env.CRON_SECRET),
  RESEND_API_KEY: emptyToUndefined(process.env.RESEND_API_KEY),
  RESEND_FROM_EMAIL: emptyToUndefined(process.env.RESEND_FROM_EMAIL),
  NEXT_PUBLIC_MAPBOX_TOKEN: emptyToUndefined(
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  ),
});

function invalidEnvKeys(): string[] {
  if (parsed.success) return [];
  return [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
}

if (!parsed.success) {
  // Name the bad keys (never their values) so a misconfigured deploy is obvious.
  const message = `Invalid environment variables: ${invalidEnvKeys().join(", ")}`;
  if (process.env.NODE_ENV === "production" && typeof window === "undefined") {
    throw new Error(message);
  }
  console.error(message);
}

export const env: z.infer<typeof envSchema> = parsed.success
  ? parsed.data
  : {
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      NOTIFICATIONS_PROCESS_SECRET: undefined,
      CRON_SECRET: undefined,
      RESEND_API_KEY: undefined,
      RESEND_FROM_EMAIL: undefined,
      NEXT_PUBLIC_MAPBOX_TOKEN: undefined,
    };

if (
  process.env.VERCEL_ENV === "production" &&
  typeof window === "undefined" &&
  env.NEXT_PUBLIC_APP_URL.includes("localhost")
) {
  console.error(
    "NEXT_PUBLIC_APP_URL is not set for production; invite and invoice links will point at localhost."
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project") &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "your-anon-key"
  );
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export function isMapboxConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_MAPBOX_TOKEN);
}
