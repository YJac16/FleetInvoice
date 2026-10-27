export const DRIVER_THEME_CHOICES = ["light", "dark", "system"] as const;

export type DriverThemeChoice = (typeof DRIVER_THEME_CHOICES)[number];

export function isDriverThemeChoice(
  value: string | undefined
): value is DriverThemeChoice {
  return (
    value === "light" || value === "dark" || value === "system"
  );
}

/** Header icon cycles Light → Dark → System → Light. */
export function nextDriverTheme(current: string | undefined): DriverThemeChoice {
  const index = DRIVER_THEME_CHOICES.indexOf(current as DriverThemeChoice);
  const nextIndex =
    index === -1 ? 0 : (index + 1) % DRIVER_THEME_CHOICES.length;
  return DRIVER_THEME_CHOICES[nextIndex] ?? "light";
}
