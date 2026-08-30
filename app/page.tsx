"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      if (!isSupabaseConfigured()) {
        router.replace("/login");
        return;
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      router.replace(user ? "/hub" : "/login");
    }
    void redirect();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading WorkOps…
    </div>
  );
}
