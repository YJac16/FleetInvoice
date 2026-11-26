"use client";

import { CompactSelect } from "@/components/shared/compact-select";
import { Button } from "@/components/ui/button";
import type {
  InvoiceSortOrder,
  InvoiceStatusFilter,
} from "@/features/invoices/lib/invoice-list-filters";
import { OWNER_FILTER_LABELS, OWNER_FILTERS, type OwnerFilter } from "@/lib/owner-tag";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "void", label: "Void" },
];

const OWNER_OPTIONS: { value: OwnerFilter; label: string }[] = OWNER_FILTERS.map((value) => ({
  value,
  label: OWNER_FILTER_LABELS[value],
}));

function FilterChipRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  selectLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  selectLabel: string;
}) {
  return (
    <>
    <CompactSelect
      className="lg:hidden"
      label={selectLabel}
      value={value}
      options={options}
      onChange={onChange}
    />
    <div
      className="hidden gap-2 pb-1 lg:flex lg:flex-wrap"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            className={cn("shrink-0 rounded-full", selected && "shadow-sm")}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
    </>
  );
}

export function InvoiceSortToggle({
  value,
  onChange,
}: {
  value: InvoiceSortOrder;
  onChange: (value: InvoiceSortOrder) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border bg-background p-0.5"
      role="group"
      aria-label="Sort invoices"
    >
      {(["newest", "oldest"] as const).map((option) => {
        const selected = value === option;
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={selected ? "default" : "ghost"}
            className="min-w-[4.5rem] rounded-md capitalize"
            aria-pressed={selected}
            onClick={() => onChange(option)}
          >
            {option}
          </Button>
        );
      })}
    </div>
  );
}

export function InvoiceListFilters({
  statusFilter,
  onStatusFilterChange,
  ownerFilter,
  onOwnerFilterChange,
}: {
  statusFilter: InvoiceStatusFilter;
  onStatusFilterChange: (value: InvoiceStatusFilter) => void;
  ownerFilter?: OwnerFilter;
  onOwnerFilterChange?: (value: OwnerFilter) => void;
}) {
  return (
    <div className="space-y-2">
      <FilterChipRow
        ariaLabel="Filter by invoice status"
        selectLabel="Status"
        options={STATUS_OPTIONS}
        value={statusFilter}
        onChange={onStatusFilterChange}
      />
      {ownerFilter && onOwnerFilterChange ? (
        <FilterChipRow
          ariaLabel="Filter by owner"
          selectLabel="Owner"
          options={OWNER_OPTIONS}
          value={ownerFilter}
          onChange={onOwnerFilterChange}
        />
      ) : null}
    </div>
  );
}
