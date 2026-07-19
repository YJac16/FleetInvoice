"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Save,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AreaMultiSelect } from "@/features/trips/components/area-multi-select";
import {
  tripFormSchema,
  tripStepFields,
  type TripFormValues,
} from "@/features/trips/schemas";
import {
  clearTripDraft,
  loadTripDraft,
  notifyDraftRestored,
  useTripDraftAutosave,
} from "@/features/trips/hooks/use-trip-draft";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatTripTime } from "@/lib/trips/filters";
import { formatVehicleLabel } from "@/lib/trips/labels";
import {
  checkDuplicateTrip,
  createTrip,
  updateTrip,
} from "@/services/trips.service";
import { dayjs } from "@/utils/dates";

interface LookupOptions {
  companies: { id: string; company_name: string }[];
  vehicles: {
    id: string;
    registration: string;
    make: string;
    model: string;
  }[];
  areas: string[];
}

interface TripFormProps {
  mode: "create" | "edit";
  tripId?: string;
  lookups: LookupOptions;
  defaultVehicleId?: string | null;
  initialValues?: Partial<TripFormValues>;
  readOnly?: boolean;
}

const STEPS = [
  { id: 1, title: "Basics" },
  { id: 2, title: "Route" },
  { id: 3, title: "Details" },
  { id: 4, title: "Review" },
] as const;

function buildDefaults(
  initialValues?: Partial<TripFormValues>,
  defaultVehicleId?: string | null
): TripFormValues {
  return {
    tripDate: initialValues?.tripDate ?? dayjs().format("YYYY-MM-DD"),
    tripTime: initialValues?.tripTime ?? dayjs().format("HH:mm"),
    companyId: initialValues?.companyId ?? "",
    vehicleId: initialValues?.vehicleId ?? defaultVehicleId ?? "",
    pickupArea: initialValues?.pickupArea ?? "",
    destinationArea: initialValues?.destinationArea ?? "",
    areasVisited: initialValues?.areasVisited ?? [],
    passengers: initialValues?.passengers ?? 1,
    notes: initialValues?.notes ?? "",
  };
}

export function TripForm({
  mode,
  tripId,
  lookups,
  defaultVehicleId,
  initialValues,
  readOnly = false,
}: TripFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<TripFormValues | null>(
    null
  );

  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: buildDefaults(initialValues, defaultVehicleId),
    mode: "onTouched",
  });

  const values = form.watch();

  useEffect(() => {
    if (mode !== "create" || readOnly) return;
    const draft = loadTripDraft();
    if (!draft) return;
    form.reset(draft.values);
    setStep(draft.step || 1);
    notifyDraftRestored();
  }, [form, mode, readOnly]);

  useTripDraftAutosave({
    values,
    step,
    tripId,
    enabled: !readOnly,
  });

  const companyName = useMemo(
    () =>
      lookups.companies.find((c) => c.id === values.companyId)?.company_name ??
      "—",
    [lookups.companies, values.companyId]
  );

  const vehicleLabel = useMemo(() => {
    const vehicle = lookups.vehicles.find((v) => v.id === values.vehicleId);
    return vehicle ? formatVehicleLabel(vehicle) : "—";
  }, [lookups.vehicles, values.vehicleId]);

  async function validateStep(current: number): Promise<boolean> {
    const fields = tripStepFields[current] ?? [];
    if (fields.length === 0) return true;
    return form.trigger(fields);
  }

  async function goNext() {
    const ok = await validateStep(step);
    if (!ok) return;
    setStep((prev) => Math.min(prev + 1, 4));
  }

  function goBack() {
    setStep((prev) => Math.max(prev - 1, 1));
  }

  async function submitValues(formValues: TripFormValues, force = false) {
    if (!force) {
      const duplicate = await checkDuplicateTrip({
        tripDate: formValues.tripDate,
        tripTime: formValues.tripTime,
        companyId: formValues.companyId,
        excludeId: tripId,
      });
      if (duplicate.duplicate) {
        setPendingSubmit(formValues);
        setDuplicateOpen(true);
        return;
      }
    }

    startTransition(async () => {
      const result =
        mode === "edit" && tripId
          ? await updateTrip(tripId, formValues)
          : await createTrip(formValues);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      clearTripDraft();
      toast.success(mode === "edit" ? "Trip updated" : "Trip saved");
      router.push(ROUTES.trips);
      router.refresh();
    });
  }

  async function onFinalSubmit() {
    const ok = await form.trigger();
    if (!ok) {
      setStep(1);
      return;
    }
    await submitValues(form.getValues());
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-28 sm:pb-8">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((item, index) => {
          const active = step === item.id;
          const complete = step > item.id;
          return (
            <div key={item.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                  active && "bg-primary text-primary-foreground",
                  complete && "bg-accent text-accent-foreground",
                  !active && !complete && "bg-muted text-muted-foreground"
                )}
              >
                {complete ? <Check className="size-3.5" /> : item.id}
              </div>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {item.title}
              </span>
              {index < STEPS.length - 1 ? (
                <div className="mx-1 h-px w-6 bg-border sm:w-10" />
              ) : null}
            </div>
          );
        })}
      </div>

      <form
        className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void onFinalSubmit();
        }}
      >
        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tripDate">Date</Label>
                <Input
                  id="tripDate"
                  type="date"
                  disabled={readOnly || isPending}
                  className="h-11"
                  {...form.register("tripDate")}
                />
                {form.formState.errors.tripDate ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.tripDate.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tripTime">Time</Label>
                <Input
                  id="tripTime"
                  type="time"
                  disabled={readOnly || isPending}
                  className="h-11"
                  {...form.register("tripTime")}
                />
                {form.formState.errors.tripTime ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.tripTime.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Company</Label>
              <Controller
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    disabled={readOnly || isPending}
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.companyId ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.companyId.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Controller
                control={form.control}
                name="vehicleId"
                render={({ field }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    disabled={readOnly || isPending}
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {formatVehicleLabel(vehicle)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.vehicleId ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.vehicleId.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pickup Area</Label>
              <Controller
                control={form.control}
                name="pickupArea"
                render={({ field }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    disabled={readOnly || isPending}
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Select pickup area" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.areas.map((area) => (
                        <SelectItem key={area} value={area}>
                          {area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.pickupArea ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.pickupArea.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Destination Area</Label>
              <Controller
                control={form.control}
                name="destinationArea"
                render={({ field }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    disabled={readOnly || isPending}
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.areas.map((area) => (
                        <SelectItem key={`dest-${area}`} value={area}>
                          {area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.destinationArea ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.destinationArea.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Areas Visited</Label>
              <p className="text-xs text-muted-foreground">
                Tap every area covered on this trip.
              </p>
              <Controller
                control={form.control}
                name="areasVisited"
                render={({ field }) => (
                  <AreaMultiSelect
                    options={lookups.areas}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={readOnly || isPending}
                  />
                )}
              />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="passengers">Passengers</Label>
              <Input
                id="passengers"
                type="number"
                min={1}
                max={60}
                disabled={readOnly || isPending}
                className="h-11"
                {...form.register("passengers", { valueAsNumber: true })}
              />
              {form.formState.errors.passengers ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.passengers.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Trip Notes</Label>
              <Textarea
                id="notes"
                rows={5}
                placeholder="Optional notes for the office…"
                disabled={readOnly || isPending}
                {...form.register("notes")}
              />
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review your trip details before submitting. No pricing is shown.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Date", dayjs(values.tripDate).format("DD MMM YYYY")],
                ["Time", formatTripTime(values.tripTime)],
                ["Company", companyName],
                ["Vehicle", vehicleLabel],
                ["Pickup", values.pickupArea || "—"],
                ["Destination", values.destinationArea || "—"],
                [
                  "Areas visited",
                  values.areasVisited?.length
                    ? values.areasVisited.join(", ")
                    : "—",
                ],
                ["Passengers", String(values.passengers ?? "—")],
                ["Notes", values.notes?.trim() ? values.notes : "—"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5"
                >
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm font-medium break-words">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <div className="hidden items-center justify-between gap-3 pt-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 1 || isPending}
            className="min-h-11"
          >
            <ArrowLeft />
            Back
          </Button>
          {step < 4 ? (
            <Button
              type="button"
              onClick={() => void goNext()}
              disabled={readOnly || isPending}
              className="min-h-11"
            >
              Continue
              <ArrowRight />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={readOnly || isPending}
              className="min-h-11"
            >
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save />
                  Submit Trip
                </>
              )}
            </Button>
          )}
        </div>
      </form>

      {/* Sticky mobile actions */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 1 || isPending}
            className="min-h-12 flex-1"
          >
            Back
          </Button>
          {step < 4 ? (
            <Button
              type="button"
              onClick={() => void goNext()}
              disabled={readOnly || isPending}
              className="min-h-12 flex-[2]"
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void onFinalSubmit()}
              disabled={readOnly || isPending}
              className="min-h-12 flex-[2]"
            >
              {isPending ? "Saving…" : "Submit Trip"}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        title="A similar trip already exists"
        description="Another trip with the same driver, date, time, and company was found. Cancel to review, or continue to save this trip anyway."
        confirmLabel="Continue anyway"
        cancelLabel="Cancel"
        loading={isPending}
        onConfirm={() => {
          if (!pendingSubmit) return;
          setDuplicateOpen(false);
          void submitValues(pendingSubmit, true);
        }}
      />
    </div>
  );
}
