"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  isDriverThemeChoice,
  nextDriverTheme,
  type DriverThemeChoice,
} from "@/features/driver-portal/lib/driver-theme";
import { cn } from "@/lib/utils";

const OPTIONS: {
  value: DriverThemeChoice;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function choiceIcon(choice: DriverThemeChoice) {
  if (choice === "dark") return Moon;
  if (choice === "light") return Sun;
  return Monitor;
}

export function DriverThemeControl({
  variant = "segmented",
}: {
  variant?: "segmented" | "icon";
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current: DriverThemeChoice = isDriverThemeChoice(theme)
    ? theme
    : "system";

  if (variant === "icon") {
    const shown = mounted ? current : "system";
    const Icon = choiceIcon(shown);
    const next = nextDriverTheme(mounted ? current : "system");
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground"
        aria-label={
          mounted ? `Theme: ${current}. Switch to ${next}` : "Theme"
        }
        onClick={() => setTheme(nextDriverTheme(current))}
      >
        <Icon className="size-4" />
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex max-w-full flex-wrap rounded-lg border bg-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = mounted && current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTheme(option.value)}
          >
            <Icon className="size-3.5" aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
