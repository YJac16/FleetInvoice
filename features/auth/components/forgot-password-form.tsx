"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/features/auth/schemas/auth";
import { APP_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { requestPasswordReset } from "@/services/auth.service";
import { getErrorMessage } from "@/utils/errors";

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase is not configured. Add credentials to .env.local.");
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
      toast.success("Check your email for a reset link");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to send reset email"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border/80 shadow-none">
      <CardHeader className="space-y-2">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {APP_NAME}
        </p>
        <CardTitle className="font-heading text-3xl">Reset password</CardTitle>
        <CardDescription>
          Enter your account email and we will send a secure reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <TextField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              placeholder="you@company.com"
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
