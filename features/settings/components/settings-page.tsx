"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  organisationSchema,
  type OrganisationValues,
} from "@/features/organisations/schemas/organisation";
import {
  invoicePrintSettingsFromOrganisation,
  invoicePrintSettingsToOrganisationSettings,
} from "@/features/settings/lib/invoice-print-settings-form";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  getOrganisation,
  updateOrganisation,
} from "@/services/organisations.service";
import {
  removeOrganisationLogo,
  uploadOrganisationLogo,
} from "@/services/org-logo.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const invoicePrintFormSchema = z.object({
  supplier_name: z.string(),
  supplier_address: z.string(),
  supplier_phone: z.string(),
  supplier_email: z.string(),
  bank: z.string(),
  account_name: z.string(),
  account_number: z.string(),
  branch_code: z.string(),
  account_type: z.string(),
  contact_name: z.string(),
  contact_phone: z.string(),
  contact_email: z.string(),
  vehicle_reg: z.string(),
  driver_label: z.string(),
});

type InvoicePrintFormValues = z.infer<typeof invoicePrintFormSchema>;

const EMPTY_INVOICE_PRINT: InvoicePrintFormValues = {
  supplier_name: "",
  supplier_address: "",
  supplier_phone: "",
  supplier_email: "",
  bank: "",
  account_name: "",
  account_number: "",
  branch_code: "",
  account_type: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  vehicle_reg: "",
  driver_label: "",
};

export function SettingsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("settings:manage");
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  const invoiceForm = useForm<InvoicePrintFormValues>({
    resolver: zodResolver(invoicePrintFormSchema),
    defaultValues: EMPTY_INVOICE_PRINT,
  });

  useEffect(() => {
    if (!orgQuery.data) return;
    form.reset({
      name: orgQuery.data.name,
      slug: orgQuery.data.slug,
    });
    invoiceForm.reset(
      invoicePrintSettingsFromOrganisation(orgQuery.data)
    );
  }, [orgQuery.data, form, invoiceForm]);

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

  const invoiceSettingsMutation = useMutation({
    mutationFn: async (values: InvoicePrintFormValues) => {
      const org = orgQuery.data;
      if (!org) throw new Error("Organisation not loaded");
      const settings = invoicePrintSettingsToOrganisationSettings(
        values,
        org.settings ?? {}
      );
      return updateOrganisation(organisationId!, { settings });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organisation(organisationId!),
      });
      toast.success("Invoice print settings saved");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) => uploadOrganisationLogo(organisationId!, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organisation(organisationId!),
      });
      toast.success("Company logo updated");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const logoRemoveMutation = useMutation({
    mutationFn: () => removeOrganisationLogo(organisationId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organisation(organisationId!),
      });
      toast.success("Company logo removed");
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

  const logoUrl = orgQuery.data?.logo_url;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Organisation profile, invoice letterhead, and banking details for print."
      />

      {orgQuery.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Organisation</CardTitle>
              <CardDescription>
                Name and slug for the active organisation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) =>
                  updateMutation.mutate(values)
                )}
              >
                <TextField
                  control={form.control}
                  name="name"
                  label="Organisation name"
                />
                <TextField control={form.control} name="slug" label="Slug" />
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving…" : "Save organisation"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Company logo</CardTitle>
              <CardDescription>
                Shown on invoice print when uploaded. Without a logo, invoices
                use a text-only supplier header.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Company logo"
                    className="h-14 w-auto max-w-[200px] rounded border object-contain p-2"
                  />
                ) : (
                  <div className="flex h-14 min-w-[120px] items-center justify-center rounded border border-dashed px-4 text-sm text-muted-foreground">
                    No logo
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="org-logo-upload">Upload logo</Label>
                  <input
                    id="org-logo-upload"
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) logoUploadMutation.mutate(file);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={logoUploadMutation.isPending}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {logoUploadMutation.isPending
                        ? "Uploading…"
                        : logoUrl
                          ? "Replace logo"
                          : "Upload logo"}
                    </Button>
                    {logoUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={logoRemoveMutation.isPending}
                        onClick={() => logoRemoveMutation.mutate()}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG or JPG, max 2 MB. Stored per organisation.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Invoice print</CardTitle>
              <CardDescription>
                Supplier header, banking footer, and default REG NO / DRIVER
                labels for printed invoices.{" "}
                <Link href="/invoices" className="underline">
                  View invoices
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-6"
                onSubmit={invoiceForm.handleSubmit((values) =>
                  invoiceSettingsMutation.mutate(values)
                )}
              >
                <div className="space-y-4">
                  <p className="text-sm font-medium">Supplier header</p>
                  <TextField
                    control={invoiceForm.control}
                    name="supplier_name"
                    label="Supplier name"
                  />
                  <TextField
                    control={invoiceForm.control}
                    name="supplier_address"
                    label="Address"
                    placeholder="One line per row"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      control={invoiceForm.control}
                      name="supplier_phone"
                      label="Phone"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="supplier_email"
                      label="Email"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-medium">Banking footer</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      control={invoiceForm.control}
                      name="bank"
                      label="Bank"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="account_type"
                      label="Account type"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="account_name"
                      label="Account name"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="account_number"
                      label="Account number"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="branch_code"
                      label="Branch code"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-medium">Contact footer</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      control={invoiceForm.control}
                      name="contact_name"
                      label="Contact name"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="contact_phone"
                      label="Contact phone"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="contact_email"
                      label="Contact email"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-medium">Print defaults</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      control={invoiceForm.control}
                      name="vehicle_reg"
                      label="REG NO default"
                      placeholder="e.g. GR 11 WP"
                    />
                    <TextField
                      control={invoiceForm.control}
                      name="driver_label"
                      label="DRIVER default"
                      placeholder="e.g. YASEEN"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Trip invoices override these from assignments when not set.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={invoiceSettingsMutation.isPending}
                >
                  {invoiceSettingsMutation.isPending
                    ? "Saving…"
                    : "Save invoice print settings"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
