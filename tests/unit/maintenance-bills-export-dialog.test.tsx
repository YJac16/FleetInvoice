/**
 * U6: Export CSV dialog on /maintenance/bills.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import {
  BillsExportDialog,
  buildBillsExportUrl,
  exportErrorMessage,
} from "@/features/maintenance/components/bills-export-dialog";

const VEHICLE = "c0000000-0000-4000-8000-000000000001";
const SUPPLIER = "d0000000-0000-4000-8000-000000000001";
const OPTIONS = {
  vehicles: [{ value: VEHICLE, label: "Truck 1 / CA 1" }],
  suppliers: [{ value: SUPPLIER, label: "Tyre World" }],
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  toastError.mockReset();
});

describe("buildBillsExportUrl", () => {
  it("sends only the filters, never an org", () => {
    expect(buildBillsExportUrl({ from: "2026-11-01", to: "2026-11-23", vehicle: "", supplier: "" })).toBe(
      "/api/maintenance/bills/export?from=2026-11-01&to=2026-11-23"
    );
    const url = buildBillsExportUrl({ from: "2026-11-01", to: "2026-11-23", vehicle: VEHICLE, supplier: SUPPLIER });
    expect(url).toBe(`/api/maintenance/bills/export?from=2026-11-01&to=2026-11-23&vehicle=${VEHICLE}&supplier=${SUPPLIER}`);
    expect(url).not.toMatch(/org/);
  });
});

describe("exportErrorMessage", () => {
  it("maps route errors to friendly text", () => {
    expect(exportErrorMessage({ error: "too_many_rows" })).toMatch(/shorter date range/);
    expect(exportErrorMessage({ error: "invalid_filters", fieldErrors: { to: "Choose a range of 12 months or less" } })).toBe(
      "Choose a range of 12 months or less"
    );
    expect(exportErrorMessage({ error: "module_not_entitled" })).toMatch(/access/);
    expect(exportErrorMessage({})).toMatch(/try again/);
  });
});

describe("BillsExportDialog", () => {
  function openDialog() {
    render(<BillsExportDialog options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
  }

  it("defaults to month-to-date and fetches the CSV uncached with chosen filters", async () => {
    fetchMock.mockResolvedValue(
      new Response("﻿Bill date\r\n", {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="workshop-bills_2026-11-01_2026-11-23.csv"' },
      })
    );
    openDialog();
    const from = screen.getByLabelText("From") as HTMLInputElement;
    const to = screen.getByLabelText("To") as HTMLInputElement;
    expect(from.value).toMatch(/^\d{4}-\d{2}-01$/);
    expect(to.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.change(from, { target: { value: "2026-11-01" } });
    fireEvent.change(to, { target: { value: "2026-11-23" } });
    fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: VEHICLE } });
    fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: SUPPLIER } });
    fireEvent.click(screen.getByRole("button", { name: /download csv/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/maintenance/bills/export?from=2026-11-01&to=2026-11-23&vehicle=${VEHICLE}&supplier=${SUPPLIER}`,
      { method: "GET", cache: "no-store" }
    );
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the route's error instead of downloading", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "too_many_rows" }), { status: 422, headers: { "Content-Type": "application/json" } })
    );
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: /download csv/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/shorter date range/)));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
