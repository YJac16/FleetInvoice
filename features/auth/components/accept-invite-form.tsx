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
import { APP_NAME, ROLE_LABELS, type AppRole } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import {
  acceptInvitationToken,
  getInvitationByToken,
  signInWithPassword,
  signUpWithInvite,
} from "@/services/auth.service";
import { getErrorMessage } from "@/utils/errors";

type InvitePreview = {
  email: string;
  role: string;
  organisation_id: string;
};

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<InvitePreview | null>(null);

  const form = useForm<AcceptInviteValues>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { fullName: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }
      try {
        const rows = await getInvitationByToken(token);
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) {
          setInvite(null);
        } else {
          setInvite({
            email: row.email,
            role: row.role,
            organisation_id: row.organisation_id,
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        try {
          await signUpWithInvite({
            email: invite.email,
            password: values.password,
            fullName: values.fullName,
          });
        } catch {
          await signInWithPassword(invite.email, values.password);
        }

        const {
          data: { user: signedIn },
        } = await supabase.auth.getUser();

        if (!signedIn) {
          await signInWithPassword(invite.email, values.password);
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
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {APP_NAME}
        </p>
        <CardTitle className="font-heading text-3xl">Accept invite</CardTitle>
        <CardDescription>
          Joining as{" "}
          <span className="font-medium text-foreground">
            {ROLE_LABELS[invite.role as AppRole] ?? invite.role}
          </span>{" "}
          for <span className="font-medium text-foreground">{invite.email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
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
