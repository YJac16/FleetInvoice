import type { InvoiceTripEmbed } from "@/features/invoices/lib/invoice-trip-row";

/** Inclusive Sunday for the service week, whether period_end is Sunday or exclusive Monday. */
export function resolveServiceWeekEnd(
  periodEnd: string | null | undefined
): string | null {
  if (!periodEnd?.trim()) return null;

  const dateOnly = periodEnd.trim().slice(0, 10);
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  if (d.getUTCDay() === 1) {
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  return dateOnly;
}

/** DDMMYYYY for PDF filenames (service week bounds). */
export function formatFilenameDate(value: string | null | undefined): string {
  if (!value?.trim()) return "00000000";
  const dateOnly = value.trim().slice(0, 10);
  const [year, month, day] = dateOnly.split("-");
  if (!year || !month || !day) return "00000000";
  return `${day}${month}${year}`;
}

function firstDriverFullName(trips: InvoiceTripEmbed[]): string | null {
  for (const trip of trips) {
    const assignments = trip.trip_assignments;
    if (!assignments?.length) continue;
    for (const assignment of assignments) {
      const drivers = assignment.drivers;
      const row = Array.isArray(drivers) ? drivers[0] : drivers;
      const name = row?.full_name?.trim();
      if (name) return name;
    }
  }
  return null;
}

function toAsciiFilenamePart(value: string): string {
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\s-]/g, "")
    .trim();
  if (!ascii) return "Driver";

  const words = ascii.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const word = words[0]!;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("_");
}

/** Driver slug for PDF filenames — first name when available, ASCII, underscores for multi-word. */
export function resolveDriverFilenameSlug(
  settingsLabel: string | undefined,
  trips: InvoiceTripEmbed[]
): string {
  if (settingsLabel?.trim()) {
    const label = settingsLabel.trim();
    if (label.toUpperCase() === "VARIOUS") return "Various";
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      return toAsciiFilenamePart(words[0]!);
    }
    return toAsciiFilenamePart(label);
  }

  const names = new Set<string>();
  for (const trip of trips) {
    const fullName = firstDriverFullName([trip]);
    if (fullName) {
      const first = fullName.split(/\s+/)[0];
      if (first) names.add(first);
    }
  }

  if (names.size === 1) return toAsciiFilenamePart([...names][0]!);
  if (names.size > 1) return "Various";
  return "Driver";
}

export function buildInvoicePdfFilename(input: {
  period_start: string;
  period_end: string;
  settingsDriverLabel?: string;
  trips: InvoiceTripEmbed[];
}): string {
  const driver = resolveDriverFilenameSlug(
    input.settingsDriverLabel,
    input.trips
  );
  const start = formatFilenameDate(input.period_start);
  const weekEnd =
    resolveServiceWeekEnd(input.period_end) ?? input.period_end.slice(0, 10);
  const end = formatFilenameDate(weekEnd);
  return `${driver}_INV_${start}_${end}.pdf`;
}

/** document.title for browser Print → Save as PDF (filename without extension). */
export function invoicePdfDocumentTitle(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}
