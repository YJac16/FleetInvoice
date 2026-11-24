/**
 * Delete button on a draft workshop bill: confirm dialog first, action only
 * after confirming. The page renders it for draft bills only (see page.tsx).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BILL = "b1000000-0000-4000-8000-000000000001";
const { deleteAction, toastError, toastSuccess, replace, refresh } = vi.hoisted(() => ({
  deleteAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/features/maintenance/actions", () => ({ deleteWorkshopBillAction: deleteAction }));

import { DeleteBillButton } from "@/features/maintenance/components/delete-bill-button";

beforeEach(() => deleteAction.mockResolvedValue({ ok: true, id: BILL }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeleteBillButton", () => {
  it("asks for confirmation before deleting", () => {
    render(<DeleteBillButton billId={BILL} invoiceRef="INV-9" />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.getByText("Delete this draft bill?")).toBeTruthy();
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("deletes after confirming and returns to the list", async () => {
    render(<DeleteBillButton billId={BILL} invoiceRef="INV-9" />);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete bill" }));
    await waitFor(() => expect(deleteAction).toHaveBeenCalledWith(BILL));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/maintenance/bills"));
  });

  it("shows the server's message when the delete is refused", async () => {
    deleteAction.mockResolvedValue({ ok: false, error: "bill_not_draft", message: "Only draft bills can be deleted." });
    render(<DeleteBillButton billId={BILL} invoiceRef="INV-9" />);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete bill" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Only draft bills can be deleted."));
    expect(replace).not.toHaveBeenCalled();
  });
});
