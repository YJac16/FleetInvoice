import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_ONLY_ROUTES,
  AUTH_ROUTES,
  COOKIE_REMEMBER_ME,
  ROUTES,
} from "@/lib/constants";
import { env } from "@/lib/env";
import type { Database, UserRole } from "@/types/database";

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isAdminOnlyRoute(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isProtectedAppRoute(pathname: string): boolean {
  if (pathname.startsWith("/auth")) return false;
  if (isAuthRoute(pathname)) return false;
  return (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/trips") ||
    pathname.startsWith("/drivers") ||
    pathname.startsWith("/companies") ||
    pathname.startsWith("/vehicles") ||
    pathname.startsWith("/areas") ||
    pathname.startsWith("/pricing-rules") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/settings")
  );
}

/**
 * Refreshes the Supabase session and enforces auth + role redirects.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Without Supabase env, skip auth enforcement so local UI can still compile/run.
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    supabaseResponse.headers.set("x-pathname", request.nextUrl.pathname);
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Honour "Remember me": shorter session when unchecked.
            const remember =
              request.cookies.get(COOKIE_REMEMBER_ME)?.value === "1";
            const maxAge = remember
              ? options?.maxAge
              : Math.min(options?.maxAge ?? 60 * 60 * 24, 60 * 60 * 24);
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge,
            });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedAppRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.login;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.dashboard;
    return NextResponse.redirect(url);
  }

  if (user && isAdminOnlyRoute(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: UserRole }>();

    const role: UserRole = profile?.role ?? "driver";

    if (role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = ROUTES.dashboard;
      url.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(url);
    }
  }

  if (user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.dashboard;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
