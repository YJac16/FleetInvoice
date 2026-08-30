import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize, type SerializeOptions } from "cookie";

import { env, isSupabaseConfigured } from "@/lib/env";

import { isKeepSignedIn } from "./auth-persistence";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cachedClient: BrowserClient | null = null;
let cachedPersist = true;

function documentCookieGetAll() {
  const parsed = parse(document.cookie);
  return Object.keys(parsed).map((name) => ({
    name,
    value: parsed[name] ?? "",
  }));
}

function documentCookieSetAll(
  cookiesToSet: { name: string; value: string; options?: SerializeOptions }[],
  persist: boolean
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    const base = options ?? {};
    const cookieOptions: SerializeOptions = persist
      ? base
      : { ...base, maxAge: undefined, expires: undefined };
    document.cookie = serialize(name, value, cookieOptions);
  });
}

export function resetBrowserClientCache() {
  cachedClient = null;
}

export function createClient(): BrowserClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  const persist = typeof window !== "undefined" ? isKeepSignedIn() : true;

  if (cachedClient && cachedPersist === persist) {
    return cachedClient;
  }

  const client = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      cookies: {
        getAll: documentCookieGetAll,
        setAll: (cookiesToSet) => documentCookieSetAll(cookiesToSet, persist),
      },
      auth: {
        persistSession: true,
      },
    }
  );

  cachedClient = client;
  cachedPersist = persist;
  return client;
}
