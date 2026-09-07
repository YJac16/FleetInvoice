export async function sendInvoiceEmail(input: {
  organisationId: string;
  invoiceId: string;
  to: string;
  cc?: string;
  printUrl: string;
}): Promise<{ message: string }> {
  const response = await fetch("/api/invoices/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to send invoice email");
  }
  return { message: payload.message ?? "Invoice sent" };
}
