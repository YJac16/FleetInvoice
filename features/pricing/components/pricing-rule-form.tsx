"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  pricingRuleFormSchema,
  type PricingRuleFormValues,
} from "@/features/pricing/schemas";
import { cn } from "@/lib/utils";

interface PricingRuleFormProps {
  defaultValues?: Partial<PricingRuleFormValues>;
  companies: { id: string; company_name: string }[];
  areas: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
  onSubmit: (values: PricingRuleFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitting?: boolean;
  submitLabel?: string;
}

export function PricingRuleForm({
  defaultValues,
  companies,
  areas,
  vehicles,
  onSubmit,
  onCancel,
  submitting,
  submitLabel = "Save rule",
}: PricingRuleFormProps) {
  const form = useForm<PricingRuleFormValues>({
    resolver: zodResolver(pricingRuleFormSchema),
    defaultValues: {
      companyId: defaultValues?.companyId ?? companies[0]?.id ?? "",
      pickupAreaId: defaultValues?.pickupAreaId ?? areas[0]?.id ?? "",
      destinationAreaId:
        defaultValues?.destinationAreaId ?? areas[1]?.id ?? areas[0]?.id ?? "",
      areasVisited: defaultValues?.areasVisited ?? [],
      minimumPassengers: defaultValues?.minimumPassengers ?? 1,
      maximumPassengers: defaultValues?.maximumPassengers ?? 14,
      vehicleId: defaultValues?.vehicleId ?? "",
      price: defaultValues?.price ?? 0,
      priority: defaultValues?.priority ?? 0,
      active: defaultValues?.active ?? true,
      ruleName: defaultValues?.ruleName ?? "",
    },
  });

  const areasVisited = form.watch("areasVisited");

  function toggleArea(areaId: string) {
    const current = form.getValues("areasVisited") ?? [];
    if (current.includes(areaId)) {
      form.setValue(
        "areasVisited",
        current.filter((id) => id !== areaId),
        { shouldValidate: true }
      );
      return;
    }
    form.setValue("areasVisited", [...current, areaId], {
      shouldValidate: true,
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        await onSubmit({
          ...values,
          vehicleId: values.vehicleId || null,
        });
      })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Company</Label>
          <Select
            value={form.watch("companyId")}
            onValueChange={(value) =>
              form.setValue("companyId", value ?? "", { shouldValidate: true })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.companyId ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.companyId.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Pickup area</Label>
          <Select
            value={form.watch("pickupAreaId")}
            onValueChange={(value) =>
              form.setValue("pickupAreaId", value ?? "", {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pickup" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Destination area</Label>
          <Select
            value={form.watch("destinationAreaId")}
            onValueChange={(value) =>
              form.setValue("destinationAreaId", value ?? "", {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Areas visited (exact set match; leave empty for any)</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {areas.map((area) => {
              const selected = areasVisited.includes(area.id);
              return (
                <label
                  key={area.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleArea(area.id)}
                  />
                  {area.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Passenger minimum</Label>
          <Input
            type="number"
            min={1}
            max={60}
            {...form.register("minimumPassengers", { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Passenger maximum</Label>
          <Input
            type="number"
            min={1}
            max={60}
            {...form.register("maximumPassengers", { valueAsNumber: true })}
          />
          {form.formState.errors.maximumPassengers ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.maximumPassengers.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Vehicle (optional)</Label>
          <Select
            value={form.watch("vehicleId") || "__any__"}
            onValueChange={(value) =>
              form.setValue("vehicleId", value === "__any__" ? "" : (value ?? ""), {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Any vehicle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any vehicle</SelectItem>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Price (ZAR)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            {...form.register("price", { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Input
            type="number"
            min={0}
            {...form.register("priority", { valueAsNumber: true })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
          <div>
            <Label>Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive rules are soft-deleted and never match new trips.
            </p>
          </div>
          <Switch
            checked={form.watch("active")}
            onCheckedChange={(checked) =>
              form.setValue("active", Boolean(checked), { shouldValidate: true })
            }
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
