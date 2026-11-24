"use client";

import { resolveSelectLabel, type SelectOption } from "@/components/forms/select-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LabelledSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  id?: string;
};

/** Select whose trigger shows the option label (never the raw id). */
export function LabelledSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
}: LabelledSelectProps) {
  return (
    <Select
      items={options}
      value={value === "" ? null : value}
      onValueChange={(v) => onValueChange(v ?? "")}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder}>
          {(v) => resolveSelectLabel(options, v, placeholder)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
