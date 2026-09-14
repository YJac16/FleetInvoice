"use client";

import { Button } from "@/components/ui/button";
import type {
  InvoiceSortOrder,
  InvoiceStatusFilter,
  InvoiceWeekFilter,
} from "@/features/invoices/lib/invoice-list-filters";
import { cn } from "@/lib/utils";

const WEEK_OPTIONS: { value: InvoiceWeekFilter; label: string }[] = [
  { value: "this_week", label: "This week" },
  { value: "last_4_weeks", label: "Last 4 weeks" },
  { value: "all", label: "All" },
];

const STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "void", label: "Void" },
];

function FilterChipRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
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
  weekFilter,
  statusFilter,
  onWeekFilterChange,
  onStatusFilterChange,
}: {
  weekFilter: InvoiceWeekFilter;
  statusFilter: InvoiceStatusFilter;
  onWeekFilterChange: (value: InvoiceWeekFilter) => void;
  onStatusFilterChange: (value: InvoiceStatusFilter) => void;
}) {
  return (
    <div className="space-y-3">
      <FilterChipRow
        ariaLabel="Filter by service week"
        options={WEEK_OPTIONS}
        value={weekFilter}
        onChange={onWeekFilterChange}
      />
      <FilterChipRow
        ariaLabel="Filter by invoice status"
        options={STATUS_OPTIONS}
        value={statusFilter}
        onChange={onStatusFilterChange}
      />
    </div>
  );
}
