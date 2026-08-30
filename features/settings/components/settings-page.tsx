"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  organisationSchema,
  type OrganisationValues,
} from "@/features/organisations/schemas/organisation";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  getOrganisation,
  updateOrganisation,
} from "@/services/organisations.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

export function SettingsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("settings:manage");
  const queryClient = useQueryClient();

  const orgQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.organisation(organisationId)
      : ["organisations", "none"],
    queryFn: () => getOrganisation(organisationId!),
    enabled: Boolean(organisationId),
  });

  const form = useForm<OrganisationValues>({
    resolver: zodResolver(organisationSchema),
    defaultValues: { name: "", slug: "" },
  });

  useEffect(() => {
    if (!orgQuery.data) return;
    form.reset({
      name: orgQuery.data.name,
      slug: orgQuery.data.slug,
    });
  }, [orgQuery.data, form]);

  const updateMutation = useMutation({
    mutationFn: (values: OrganisationValues) =>
      updateOrganisation(organisationId!, {
        name: values.name.trim(),
        slug: values.slug?.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organisation(organisationId!),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.organisations });
      toast.success("Organisation settings saved");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!organisationId) {
    return (
      <div>
        <PageHeader
          title="Settings"
          description="Organisation settings and preferences."
        />
        <EmptyState
          title="Select an organisation"
          description="Choose an organisation from the switcher to edit settings."
        />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Settings" />
        <EmptyState
          title="Access denied"
          description="You do not have permission to manage organisation settings."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Update the active organisation name and slug."
      />

      {orgQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <form
          className="max-w-lg space-y-4"
          onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}
        >
          <TextField control={form.control} name="name" label="Organisation name" />
          <TextField control={form.control} name="slug" label="Slug" />
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}
    </div>
  );
}
