import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BILL = "b1000000-0000-4000-8000-000000000001";
const { finaliseAction, toastError, toastSuccess, refresh } = vi.hoisted(() => ({
  finaliseAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/maintenance/actions", () => ({ finaliseWorkshopBillAction: finaliseAction }));

import { FinaliseBillButton } from "@/features/maintenance/components/finalise-bill-button";

beforeEach(() => finaliseAction.mockResolvedValue({ ok: true, id: BILL }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinaliseBillButton", () => {
  it("asks for confirmation before finalising", () => {
    render(<FinaliseBillButton billId={BILL} />);
    fireEvent.click(screen.getByRole("button", { name: /finalise/i }));
    expect(screen.getByText("Finalise bill?")).toBeTruthy();
    expect(screen.getByText("It can't be edited or deleted afterwards.")).toBeTruthy();
    expect(finaliseAction).not.toHaveBeenCalled();
  });

  it("finalises after confirming and refreshes", async () => {
    render(<FinaliseBillButton billId={BILL} />);
    fireEvent.click(screen.getByRole("button", { name: /^finalise$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Finalise bill" }));
    await waitFor(() => expect(finaliseAction).toHaveBeenCalledWith(BILL));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("shows the server's message when refused", async () => {
    finaliseAction.mockResolvedValue({ ok: false, error: "bill_has_no_lines", message: "Add at least one line before finalising." });
    render(<FinaliseBillButton billId={BILL} />);
    fireEvent.click(screen.getByRole("button", { name: /^finalise$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Finalise bill" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Add at least one line before finalising."));
  });
});
