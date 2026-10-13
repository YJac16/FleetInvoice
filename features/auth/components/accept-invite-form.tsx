"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import {
  acceptInviteSchema,
  type AcceptInviteValues,
} from "@/features/auth/schemas/auth";
import { ROLE_LABELS, type AppRole } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import {
  acceptInvitationToken,
  checkInvitationEmail,
  getInvitationByToken,
  signInWithPassword,
  signOut,
  signUpWithInvite,
} from "@/services/auth.service";
import { getErrorMessage } from "@/utils/errors";

type InvitePreview = {
  org_name: string;
  email: string;
  role: string;
};

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const form = useForm<AcceptInviteValues>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { email: "", fullName: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setSignedInEmail(user?.email?.toLowerCase() ?? null);

        const row = await getInvitationByToken(token);
        if (!row) {
          setInvite(null);
        } else {
          setInvite({
            org_name: row.org_name,
            email: row.email,
            role: row.role,
          });
        }
      } catch (error) {
        toast.error(getErrorMessage(error, "Invitation not found"));
        setInvite(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token]);

  async function onSubmit(values: AcceptInviteValues) {
    if (!invite) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const normalizedEmail = values.email.trim().toLowerCase();

      const emailOk = await checkInvitationEmail(token, normalizedEmail);
      if (!emailOk) {
        toast.error(
          `That email does not match this invitation. Use the address that received the invite (hint: ${invite.email}).`
        );
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const sessionEmail = user.email?.toLowerCase() ?? "";
        if (sessionEmail !== normalizedEmail) {
          toast.error(
            `You are signed in as ${sessionEmail}. Sign out and try again with ${invite.email}.`
          );
          return;
        }
      } else {
        try {
          await signUpWithInvite({
            email: normalizedEmail,
            password: values.password,
            fullName: values.fullName,
          });
        } catch (signupError) {
          const signupMessage = getErrorMessage(signupError, "");
          if (!/already registered|already been registered|user already exists/i.test(signupMessage)) {
            throw signupError;
          }
          await signInWithPassword(normalizedEmail, values.password);
        }

        const {
          data: { user: signedIn },
        } = await supabase.auth.getUser();

        if (!signedIn) {
          await signInWithPassword(normalizedEmail, values.password);
        }
      }

      await acceptInvitationToken(token);
      toast.success("Invitation accepted");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to accept invitation"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card className="w-full max-w-md rounded-2xl p-6 shadow-none">
        <LoadingSkeleton rows={4} />
      </Card>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <Card className="w-full max-w-md rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>Configuration required</CardTitle>
          <CardDescription>
            Add Supabase credentials to `.env.local` before accepting invitations.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!invite) {
    return (
      <Card className="w-full max-w-md rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>
            This invite may be expired, revoked, or already accepted.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border/80 shadow-none">
      <CardHeader className="space-y-2">
        <CardTitle className="font-heading text-3xl">Accept invite</CardTitle>
        <CardDescription>
          Join{" "}
          <span className="font-medium text-foreground">{invite.org_name}</span> as{" "}
          <span className="font-medium text-foreground">
            {ROLE_LABELS[invite.role as AppRole] ?? invite.role}
          </span>
          . Invitation sent to{" "}
          <span className="font-medium text-foreground">{invite.email}</span>.
        </CardDescription>
        {signedInEmail ? (
          <p className="text-sm text-muted-foreground">
            Signed in as {signedInEmail}.{" "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() =>
                void signOut().then(() => {
                  setSignedInEmail(null);
                  router.refresh();
                })
              }
            >
              Not you? Sign out
            </button>
          </p>
        ) : null}
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
            name="fullName"
            label="Full name"
            placeholder="Jane Doe"
          />
          <TextField
            control={form.control}
            name="password"
            label="Password"
            type="password"
          />
          <TextField
            control={form.control}
            name="confirmPassword"
            label="Confirm password"
            type="password"
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Accepting…" : "Accept invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
