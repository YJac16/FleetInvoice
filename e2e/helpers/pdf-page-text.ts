import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPdfPageText(
  pdf: Buffer,
  pageNumber: number
): Promise<string> {
  const doc = await getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  if (pageNumber < 1 || pageNumber > doc.numPages) {
    throw new Error(`page ${pageNumber} out of range (1-${doc.numPages})`);
  }
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
    .join(" ");
}
