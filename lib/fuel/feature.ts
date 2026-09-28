/** Kill switch for fuel slip capture UI and API. Never set in repo; defaults off. */
export function isFuelSlipCaptureEnabled(): boolean {
  return process.env.FUEL_SLIP_CAPTURE_ENABLED === "true";
}

/** Client-visible gate (must mirror FUEL_SLIP_CAPTURE_ENABLED in deployment). */
export function isFuelSlipCaptureUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FUEL_SLIP_CAPTURE_ENABLED === "true";
}
