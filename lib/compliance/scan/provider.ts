import { mockExtractCompliance, type ScanExtractResult } from "@/lib/compliance/scan/mock-provider";

export type ScanProvider = {
  name: string;
  extract: (docType: string, bytes: Uint8Array) => Promise<ScanExtractResult>;
};

export function resolveScanProvider(
  providerName: string | undefined,
  nodeEnv: string | undefined
): ScanProvider | null {
  const name = providerName ?? (nodeEnv === "test" ? "mock" : undefined);
  if (name === "mock") {
    return { name: "mock", extract: mockExtractCompliance };
  }
  return null;
}

export class ProviderNotConfiguredError extends Error {
  code = "provider_not_configured" as const;
}
