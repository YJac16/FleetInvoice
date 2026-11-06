"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createOrganisationOnboardingSchema,
  type CreateOrganisationOnboardingValues,
} from "@/features/onboarding/schemas/create-organisation-onboarding";
import { invoicePrintSettingsToOrganisationSettings } from "@/features/settings/lib/invoice-print-settings-form";
import { ORG_COOKIE_NAME } from "@/lib/constants";
import { createOwnOrganisation } from "@/services/organisations.service";
import { slugify } from "@/utils/format";
import { getErrorMessage } from "@/utils/errors";

type CreateOrganisationFormProps = {
  defaultContactName?: string;
  defaultContactEmail?: string;
};

export function CreateOrganisationForm({
  defaultContactName = "",
  defaultContactEmail = "",
}: CreateOrganisationFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateOrganisationOnboardingValues>({
    resolver: zodResolver(createOrganisationOnboardingSchema),
    defaultValues: {
      name: "",
      slug: "",
      supplier_name: "",
      supplier_address: "",
      supplier_phone: "",
      supplier_email: "",
      bank: "",
      account_name: "",
      account_number: "",
      branch_code: "",
      account_type: "",
      contact_name: defaultContactName,
      contact_phone: "",
      contact_email: defaultContactEmail,
    },
  });

  const name = form.watch("name");

  useEffect(() => {
    form.setValue("slug", slugify(name ?? ""), { shouldValidate: false });
    const supplierName = form.getValues("supplier_name");
    if (!supplierName && name) {
      form.setValue("supplier_name", name, { shouldValidate: false });
    }
  }, [name, form]);

  async function onSubmit(values: CreateOrganisationOnboardingValues) {
    setSubmitting(true);
    try {
      const settings = invoicePrintSettingsToOrganisationSettings({
        supplier_name: values.supplier_name,
        supplier_address: values.supplier_address,
        supplier_phone: values.supplier_phone,
        supplier_email: values.supplier_email,
        bank: values.bank,
        account_name: values.account_name,
        account_number: values.account_number,
        branch_code: values.branch_code,
        account_type: values.account_type,
        contact_name: values.contact_name || values.supplier_name,
        contact_phone: values.contact_phone || values.supplier_phone,
        contact_email: values.contact_email || values.supplier_email,
        vehicle_reg: "",
        driver_label: "",
      });

      const org = await createOwnOrganisation({
        name: values.name,
        slug: values.slug,
        settings,
      });

      document.cookie = `${ORG_COOKIE_NAME}=${org.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      toast.success("Organisation ready");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create organisation"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Your organisation</CardTitle>
          <CardDescription>
            This name appears in the app. Invoice letterhead uses the business
            details below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextField control={form.control} name="name" label="Organisation name" />
          <TextField control={form.control} name="slug" label="URL slug" />
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Business & invoice details</CardTitle>
          <CardDescription>
            Shown on PDF invoices for this organisation only. You can change these
            later under Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextField
            control={form.control}
            name="supplier_name"
            label="Legal / trading name"
          />
          <TextAreaField
            control={form.control}
            name="supplier_address"
            label="Address"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="supplier_phone" label="Phone" />
            <TextField
              control={form.control}
              name="supplier_email"
              label="Email"
              type="email"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="bank" label="Bank" />
            <TextField
              control={form.control}
              name="account_type"
              label="Account type"
            />
          </div>
          <TextField control={form.control} name="account_name" label="Account name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="account_number"
              label="Account number"
            />
            <TextField control={form.control} name="branch_code" label="Branch code" />
          </div>
          <TextField control={form.control} name="contact_name" label="Contact name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="contact_phone" label="Contact phone" />
            <TextField
              control={form.control}
              name="contact_email"
              label="Contact email"
              type="email"
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Creating organisation…" : "Create organisation & continue"}
      </Button>
    </form>
  );
}
