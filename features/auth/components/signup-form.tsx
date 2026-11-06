"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  signUpSchema,
  type SignUpValues,
} from "@/features/auth/schemas/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { signUpWithPassword } from "@/services/auth.service";
import { getErrorMessage } from "@/utils/errors";

export function SignUpForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: SignUpValues) {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase is not configured. Add credentials to .env.local.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await signUpWithPassword({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });

      if (data.session) {
        toast.success("Account created");
        router.replace("/onboarding/create-organisation");
        router.refresh();
        return;
      }

      toast.success(
        "Check your email to confirm your account, then sign in to finish setup."
      );
      router.replace("/login");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create account"));
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
            Set Supabase env vars in <code className="font-mono">.env.local</code>{" "}
            before signing up.
          </p>
        </div>
      ) : null}
      <Card className="w-full rounded-2xl border-border/80 shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="font-heading text-3xl">Create account</CardTitle>
          <CardDescription>
            Start your own organisation on WorkOps. You will set up business and
            invoice details on the next step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <TextField control={form.control} name="fullName" label="Full name" />
            <TextField
              control={form.control}
              name="email"
              label="Email"
              type="email"
            />
            <TextField
              control={form.control}
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              revealable
            />
            <TextField
              control={form.control}
              name="confirmPassword"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              revealable
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Joining an existing team?{" "}
            <Link href="/login" className="underline-offset-4 hover:underline">
              Use your invite link
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
