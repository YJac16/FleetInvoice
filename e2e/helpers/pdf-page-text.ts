import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function loadPdfDocument(pdf: Buffer) {
  return getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
}

export async function getPdfPageCount(pdf: Buffer): Promise<number> {
  const doc = await loadPdfDocument(pdf);
  return doc.numPages;
}

export async function extractPdfPageText(
  pdf: Buffer,
  pageNumber: number
): Promise<string> {
  const doc = await loadPdfDocument(pdf);
  if (pageNumber < 1 || pageNumber > doc.numPages) {
    throw new Error(`page ${pageNumber} out of range (1-${doc.numPages})`);
  }
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
    .join(" ");
}
