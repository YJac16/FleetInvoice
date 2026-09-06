export type ParsedInvoiceLineDescription = {
  date: string;
  time: string;
  company: string;
  pax: number | null;
  area: string;
};

const PAX_PATTERN = /(\d+)\s*pax/i;

/** WEX Head Office pickup — never belongs in the printed AREA column. */
const WEX_PICKUP_TRAILING =
  /\s*\/\s*WEX(?:\s*[–-]\s*)?\s*(?:William\s*(?:Street|St\.?)?)?\s*$/i;

const WEX_PICKUP_SEGMENT =
  /^WEX(?:\s*[–-]\s*)?\s*(?:William\s*(?:Street|St\.?)?)?$/i;

const WILLIAM_STREET_PICKUP_SEGMENT = /^William\s*(?:Street|St\.?)$/i;

const HEAD_OFFICE_COMPANY = /Head\s+Office/i;

function containsWexPickupTokens(text: string): boolean {
  return /\bWEX\b|\bWilliam\s*Street\b|\bWilliam\s*St\.?\b/i.test(text);
}

function isWexPickupSegment(segment: string): boolean {
  return (
    WEX_PICKUP_SEGMENT.test(segment) ||
    WILLIAM_STREET_PICKUP_SEGMENT.test(segment)
  );
}

/**
 * Removes WEX / William Street pickup tokens from an invoice AREA value.
 * Head Office trips never show the pickup hub in AREA; trailing `/ WEX…` is
 * stripped for all companies so legacy descriptions still print cleanly.
 */
export function sanitizeInvoiceArea(area: string, company?: string): string {
  let cleaned = area.trim();
  if (!cleaned) return cleaned;

  cleaned = cleaned.replace(WEX_PICKUP_TRAILING, "").trim();

  const shouldStripPickupTokens =
    (company != null && HEAD_OFFICE_COMPANY.test(company)) ||
    containsWexPickupTokens(area);

  if (!shouldStripPickupTokens) return cleaned;

  const segments = cleaned
    .split(/\s*\/\s*/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !isWexPickupSegment(segment));

  cleaned = segments.join(" / ").trim();

  cleaned = cleaned
    .replace(/\bWEX(?:\s*[–-]\s*)?\s*(?:William\s*(?:Street|St\.?)?)?\b/gi, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s*\/\s*$/, "")
    .trim();

  return cleaned;
}

function formatDescriptionTime(time: string): string {
  const trimmed = time.trim();
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const h = Number(colonMatch[1]);
    const m = Number(colonMatch[2]);
    if (m === 0) return `${h}h00`;
    return `${h}h${String(m).padStart(2, "0")}`;
  }

  const hMatch = trimmed.match(/^(\d{1,2})h(\d{2})$/i);
  if (hMatch) {
    const h = Number(hMatch[1]);
    const m = Number(hMatch[2]);
    if (m === 0) return `${h}h00`;
    return `${h}h${String(m).padStart(2, "0")}`;
  }

  return trimmed;
}

/**
 * Parses pipe-separated invoice line descriptions, e.g.
 * `31/08/2026 18:00 | Lewis Head Office | 1 pax | Central / WEX William St`
 */
export function parseInvoiceLineDescription(
  description: string | null | undefined
): ParsedInvoiceLineDescription | null {
  if (!description?.trim()) return null;

  const text = description.trim().replace(/^Completed trip\s+/i, "");
  const parts = text.split("|").map((part) => part.trim());
  if (parts.length < 4) return null;

  const [datetimePart, company, paxPart] = parts;
  const area = parts.slice(3).join(" | ").trim();
  if (!datetimePart || !company || !paxPart || !area) return null;

  const datetimeMatch = datetimePart.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
  if (!datetimeMatch) return null;

  const [, date, timeRaw] = datetimeMatch;
  const paxMatch = paxPart.match(PAX_PATTERN);

  return {
    date,
    time: formatDescriptionTime(timeRaw),
    company,
    pax: paxMatch ? Number(paxMatch[1]) : null,
    area: sanitizeInvoiceArea(area, company),
  };
}
