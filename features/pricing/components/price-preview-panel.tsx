"use client";

import { useState, useTransition } from "react";
import { Calculator } from "lucide-react";
import { toast } from "sonner";

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
import { AreaMultiSelect } from "@/features/trips/components/area-multi-select";
import {
  previewTripPrice,
  type PricePreviewResult,
} from "@/services/pricing.service";
import { formatRand } from "@/utils/currency";
import { PricingStatusBadge } from "@/features/pricing/components/pricing-status-badge";

interface PricePreviewPanelProps {
  companies: { id: string; company_name: string }[];
  areaNames: string[];
  vehicles: { id: string; label: string }[];
}

export function PricePreviewPanel({
  companies,
  areaNames,
  vehicles,
}: PricePreviewPanelProps) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [pickupArea, setPickupArea] = useState(areaNames[0] ?? "");
  const [destinationArea, setDestinationArea] = useState(areaNames[1] ?? "");
  const [areasVisited, setAreasVisited] = useState<string[]>([]);
  const [passengers, setPassengers] = useState(4);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [result, setResult] = useState<PricePreviewResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onCalculate() {
    startTransition(async () => {
      const preview = await previewTripPrice({
        companyId,
        pickupArea,
        destinationArea,
        areasVisited,
        passengers,
        vehicleId,
      });
      setResult(preview);
      if (preview.pricingStatus === "needs_pricing") {
        toast.warning("No matching rule — trip would need pricing");
      } else {
        toast.success("Price calculated");
      }
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Price preview</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Simulate a trip to see which rule matches and the calculated price.
        Drivers never see this.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Company</Label>
          <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Pickup</Label>
          <Select
            value={pickupArea}
            onValueChange={(v) => setPickupArea(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pickup" />
            </SelectTrigger>
            <SelectContent>
              {areaNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Destination</Label>
          <Select
            value={destinationArea}
            onValueChange={(v) => setDestinationArea(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent>
              {areaNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Areas visited</Label>
          <AreaMultiSelect
            options={areaNames}
            value={areasVisited}
            onChange={setAreasVisited}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Passengers</Label>
          <Input
            type="number"
            min={1}
            max={60}
            value={passengers}
            onChange={(event) => setPassengers(Number(event.target.value) || 1)}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Vehicle</Label>
          <Select
            value={vehicleId}
            onValueChange={(v) => setVehicleId(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Vehicle" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" onClick={onCalculate} disabled={pending}>
        {pending ? "Calculating…" : "Calculate"}
      </Button>

      {result ? (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Matched rule</p>
            <p className="font-medium">{result.matchedRuleLabel}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Calculated price</p>
            <p className="font-medium">{formatRand(result.calculatedPrice)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <PricingStatusBadge status={result.pricingStatus} />
          </div>
          <div className="sm:col-span-3">
            <p className="text-muted-foreground">Reason</p>
            <p>{result.reason}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
