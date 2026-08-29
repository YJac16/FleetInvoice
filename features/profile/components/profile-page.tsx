"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { TextField } from "@/components/forms/form-fields";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  getMyEmployeeRecord,
  getProfile,
  updateMyEmployeeHome,
  updateProfile,
  uploadAvatar,
} from "@/services/profile.service";
import { signOut } from "@/services/auth.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const profileSchema = z.object({
  full_name: z.string().min(2, "Enter your full name"),
  phone: z.string().optional(),
  home_address: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

type ProfilePageProps = {
  variant?: "ops" | "employee" | "driver";
};

function initials(name: string | null | undefined, email: string | null) {
  if (name?.trim()) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return (email?.[0] ?? "U").toUpperCase();
}

export function ProfilePage({ variant = "ops" }: ProfilePageProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const organisationId = useActiveOrgId();
  const fileRef = useRef<HTMLInputElement>(null);
  const showHome = variant === "employee";
  const isFieldPortal = variant === "employee" || variant === "driver";

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getProfile,
  });

  const employeeQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.myEmployee(organisationId)
      : ["my-employee", "none"],
    queryFn: () => getMyEmployeeRecord(organisationId!),
    enabled: Boolean(organisationId) && showHome,
  });

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: "", phone: "", home_address: "" },
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    form.reset({
      full_name: profileQuery.data.full_name ?? "",
      phone: profileQuery.data.phone ?? "",
      home_address: employeeQuery.data?.home_address ?? "",
    });
  }, [profileQuery.data, employeeQuery.data, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: ProfileValues) => {
      await updateProfile({
        full_name: values.full_name.trim(),
        phone: values.phone?.trim() || null,
      });
      if (showHome && organisationId) {
        await updateMyEmployeeHome({
          organisationId,
          homeAddress: values.home_address?.trim() || null,
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.myEmployee(organisationId),
        });
      }
      toast.success("Profile updated");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      toast.success("Photo updated");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const profile = profileQuery.data;

  async function handleSignOut() {
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to sign out"));
    }
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        description={
          variant === "employee"
            ? "Update your photo, phone, and home address for pickups."
            : variant === "driver"
              ? "Update your photo and phone number."
              : "Update your personal details."
        }
      />

      {profileQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="max-w-lg space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-20">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt="" />
              ) : null}
              <AvatarFallback className="text-lg">
                {initials(profile?.full_name, profile?.email ?? null)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Label htmlFor="avatar-upload">Profile photo</Label>
              <input
                id="avatar-upload"
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) avatarMutation.mutate(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarMutation.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {avatarMutation.isPending ? "Uploading…" : "Change photo"}
              </Button>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) =>
              updateMutation.mutate(values)
            )}
          >
            <TextField
              control={form.control}
              name="full_name"
              label="Full name"
            />
            <TextField control={form.control} name="phone" label="Phone" />
            {showHome ? (
              <TextField
                control={form.control}
                name="home_address"
                label="Home address"
                placeholder="Street, suburb, city"
              />
            ) : null}
            <p className="text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="text-foreground">
                {profileQuery.data?.email ?? "—"}
              </span>
            </p>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            To change your password, use{" "}
            <Link
              href="/forgot-password"
              className="underline-offset-4 hover:underline"
            >
              forgot password
            </Link>
            .
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {isFieldPortal ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                Signed out users return to the login page.
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
