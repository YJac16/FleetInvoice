/** CSV injection escaping for Excel exports. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/^[=+\-@]/.test(s)) {
    return `'${s.replace(/"/g, '""')}`;
  }
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(",");
}

export function csvWithBom(rows: string[]): string {
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
