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
    const extract = async (docType: string, bytes: Uint8Array) => {
      if (process.env.COMPLIANCE_SCAN_MOCK_FAIL === "1") {
        throw new Error("mock_provider_failed");
      }
      if (process.env.COMPLIANCE_SCAN_MOCK_TIMEOUT === "1") {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
      }
      return mockExtractCompliance(docType, bytes);
    };
    return { name: "mock", extract };
  }
  return null;
}

export class ProviderNotConfiguredError extends Error {
  code = "provider_not_configured" as const;
}
