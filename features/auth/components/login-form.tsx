"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/forms/form-fields";
import {
  loginSchema,
  type LoginValues,
} from "@/features/auth/schemas/auth";
import { signInWithPassword } from "@/services/auth.service";
import { getErrorMessage } from "@/utils/errors";
import { APP_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase is not configured. Add credentials to .env.local.");
      return;
    }

    setSubmitting(true);
    try {
      await signInWithPassword(values.email, values.password);
      toast.success("Signed in");
      const redirect = searchParams.get("redirect") || "/hub";
      router.replace(redirect);
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to sign in"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {!isSupabaseConfigured() ? (
        <div
          role="alert"
          className="space-y-1 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">Supabase is not configured</p>
          <p className="text-destructive/90">
            Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="font-mono">.env.local</code>, then restart the dev
            server. In your Supabase project, also add{" "}
            <code className="font-mono">http://localhost:3000/auth/callback</code>{" "}
            under Auth → URL Configuration → Redirect URLs.
          </p>
        </div>
      ) : null}
      <Card className="w-full rounded-2xl border-border/80 shadow-none">
        <CardHeader className="space-y-2">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            {APP_NAME}
          </p>
          <CardTitle className="font-heading text-3xl">Sign in</CardTitle>
          <CardDescription>
            Invite-only access. Use the credentials from your organisation invitation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <TextField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              placeholder="you@company.com"
            />
            <TextField
              control={form.control}
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              revealable
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
