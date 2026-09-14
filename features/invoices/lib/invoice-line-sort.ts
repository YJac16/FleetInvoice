import { parseInvoiceLineDescription } from "@/features/invoices/lib/invoice-line-description";
import type { InvoiceLine } from "@/types";

type SortableInvoiceLine = Pick<
  InvoiceLine,
  "id" | "line_type" | "description" | "created_at"
> & {
  trips?: { planned_start: string } | null;
};

function parseDdMmYyyyTime(date: string, time: string): number | null {
  const dateMatch = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);

  let hours: number | null = null;
  let minutes: number | null = null;

  const colonMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    hours = Number(colonMatch[1]);
    minutes = Number(colonMatch[2]);
  } else {
    const hMatch = time.match(/^(\d{1,2})h(\d{2})$/i);
    if (hMatch) {
      hours = Number(hMatch[1]);
      minutes = Number(hMatch[2]);
    }
  }

  if (hours == null || minutes == null) return null;

  const timestamp = new Date(year, month - 1, day, hours, minutes).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parseLegacyDotDescriptionTimestamp(description: string): number | null {
  const parts = description.split("·").map((part) => part.trim());
  if (parts.length < 2) return null;

  const match = parts[1]?.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/
  );
  if (!match) return null;

  const timestamp = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  ).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/** Trip datetime for chronological ordering; null when not derivable. */
export function getInvoiceLineSortTimestamp(
  line: SortableInvoiceLine
): number | null {
  const plannedStart = line.trips?.planned_start;
  if (plannedStart) {
    const timestamp = new Date(plannedStart).getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  const parsed = parseInvoiceLineDescription(line.description);
  if (parsed) {
    return parseDdMmYyyyTime(parsed.date, parsed.time);
  }

  if (line.line_type === "trip") {
    return parseLegacyDotDescriptionTimestamp(line.description);
  }

  return null;
}

export function compareInvoiceLinesChronologically(
  a: SortableInvoiceLine,
  b: SortableInvoiceLine
): number {
  const aIsTrip = a.line_type === "trip";
  const bIsTrip = b.line_type === "trip";

  if (!aIsTrip && !bIsTrip) {
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  }
  if (!aIsTrip) return 1;
  if (!bIsTrip) return -1;

  const aTimestamp = getInvoiceLineSortTimestamp(a);
  const bTimestamp = getInvoiceLineSortTimestamp(b);

  if (aTimestamp == null && bTimestamp == null) {
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  }
  if (aTimestamp == null) return 1;
  if (bTimestamp == null) return -1;
  if (aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;

  return a.id.localeCompare(b.id);
}

export function sortInvoiceLinesChronologically<T extends SortableInvoiceLine>(
  lines: T[]
): T[] {
  return [...lines].sort(compareInvoiceLinesChronologically);
}

export type { SortableInvoiceLine };
