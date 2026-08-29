"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveSelectLabel,
  type SelectOption,
} from "@/components/forms/select-label";
import { cn } from "@/lib/utils";

type FieldShellProps = {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
};

export function FieldShell({
  label,
  error,
  children,
  className,
  htmlFor,
}: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type TextFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  revealable?: boolean;
};

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  type = "text",
  placeholder,
  autoComplete,
  revealable = false,
}: TextFieldProps<T>) {
  const inputId = useId();
  const [revealed, setRevealed] = useState(false);
  const inputType = revealable ? (revealed ? "text" : "password") : type;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          label={label}
          error={fieldState.error?.message}
          htmlFor={inputId}
        >
          {revealable ? (
            <div className="relative">
              <Input
                {...field}
                id={inputId}
                value={field.value ?? ""}
                type={inputType}
                placeholder={placeholder}
                autoComplete={autoComplete}
                className="pr-11"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2 text-foreground/70 hover:text-foreground"
                onClick={() => setRevealed((value) => !value)}
                aria-label={revealed ? "Hide password" : "Show password"}
              >
                {revealed ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
          ) : (
            <Input
              {...field}
              id={inputId}
              value={field.value ?? ""}
              type={inputType}
              placeholder={placeholder}
              autoComplete={autoComplete}
            />
          )}
        </FieldShell>
      )}
    />
  );
}

type TextAreaFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
};

export function TextAreaField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
}: TextAreaFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} error={fieldState.error?.message}>
          <Textarea
            {...field}
            value={field.value ?? ""}
            placeholder={placeholder}
            rows={3}
          />
        </FieldShell>
      )}
    />
  );
}

type SelectFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  options: SelectOption[];
  placeholder?: string;
};

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = "Select…",
}: SelectFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} error={fieldState.error?.message}>
          <Select
            key={`${String(name)}:${options.map((option) => option.value).join(",")}`}
            items={options}
            value={field.value === "" || field.value == null ? null : field.value}
            onValueChange={(value) => {
              field.onChange(value ?? "");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder}>
                {(value) => resolveSelectLabel(options, value, placeholder)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  );
}
