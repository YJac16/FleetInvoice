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
  MAILERSEND_API_KEY: z.string().min(1).optional(),
  MAILERSEND_FROM_EMAIL: z.string().min(1).optional(),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().min(1).optional(),
  YOCO_SECRET_KEY: z.string().min(1).optional(),
  YOCO_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_YOCO_PUBLIC_KEY: z.string().min(1).optional(),
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
  MAILERSEND_API_KEY: emptyToUndefined(process.env.MAILERSEND_API_KEY),
  MAILERSEND_FROM_EMAIL: emptyToUndefined(process.env.MAILERSEND_FROM_EMAIL),
  NEXT_PUBLIC_MAPBOX_TOKEN: emptyToUndefined(
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  ),
  YOCO_SECRET_KEY: emptyToUndefined(process.env.YOCO_SECRET_KEY),
  YOCO_WEBHOOK_SECRET: emptyToUndefined(process.env.YOCO_WEBHOOK_SECRET),
  NEXT_PUBLIC_YOCO_PUBLIC_KEY: emptyToUndefined(
    process.env.NEXT_PUBLIC_YOCO_PUBLIC_KEY
  ),
});

export const env = parsed.success
  ? parsed.data
  : {
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      NOTIFICATIONS_PROCESS_SECRET: undefined,
      CRON_SECRET: undefined,
      MAILERSEND_API_KEY: undefined,
      MAILERSEND_FROM_EMAIL: undefined,
      NEXT_PUBLIC_MAPBOX_TOKEN: undefined,
      YOCO_SECRET_KEY: undefined,
      YOCO_WEBHOOK_SECRET: undefined,
      NEXT_PUBLIC_YOCO_PUBLIC_KEY: undefined,
    };

export function isSupabaseConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project") &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "your-anon-key"
  );
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(env.MAILERSEND_API_KEY);
}

export function isMapboxConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_MAPBOX_TOKEN);
}

export function isYocoConfigured(): boolean {
  return Boolean(env.YOCO_SECRET_KEY);
}
