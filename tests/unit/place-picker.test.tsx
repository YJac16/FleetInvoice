import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlacePicker } from "@/features/places/components/place-picker";
import { isPlacePickerEnabled } from "@/features/places/lib/flags";
import {
  buildSuggestParams,
  placeDisplayText,
  suggestPlaces,
} from "@/features/places/lib/search-box";

function json(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

const SUGGESTIONS = {
  suggestions: [
    {
      mapbox_id: "id-1",
      name: "Cape Town International Airport",
      place_formatted: "Matroosfontein, Cape Town, South Africa",
      feature_type: "poi",
    },
  ],
};

function Harness({ fetchImpl, enabled = true }: { fetchImpl: typeof fetch; enabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <>
      <PlacePicker
        label="Pickup"
        value={value}
        onChange={setValue}
        accessToken="pk.test"
        searchEnabled={enabled}
        fetchImpl={fetchImpl}
      />
      <span data-testid="value">{value}</span>
    </>
  );
}

async function type(text: string) {
  fireEvent.change(screen.getByLabelText("Pickup"), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

describe("search-box helpers", () => {
  it("builds the Cape Town biased request params", () => {
    const p = buildSuggestParams("  silo  ", "pk.test", "sess-1");
    expect(p.get("q")).toBe("silo");
    expect(p.get("country")).toBe("za");
    expect(p.get("bbox")).toBe("18.28,-34.25,19.20,-33.60");
    expect(p.get("proximity")).toBe("18.4241,-33.9249");
    expect(p.get("types")).toBe("poi,address,street,neighborhood,locality");
    expect(p.get("language")).toBe("en");
    expect(p.get("limit")).toBe("6");
    expect(p.get("session_token")).toBe("sess-1");
  });

  it("never calls the API for fewer than 3 characters", async () => {
    const fetchImpl = vi.fn();
    expect(
      await suggestPlaces("ab", {
        accessToken: "t",
        sessionToken: "s",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("display text stays within 120 chars and has no pipes/newlines", () => {
    const text = placeDisplayText({
      name: "Bar | Grill\nCamps Bay",
      placeFormatted: "Camps Bay, Cape Town",
    });
    expect(text).toBe("Bar Grill Camps Bay");
    expect(placeDisplayText({ name: "x".repeat(200), placeFormatted: "" })).toHaveLength(120);
  });

  it("flag is off unless explicitly true", () => {
    expect(isPlacePickerEnabled(undefined)).toBe(false);
    expect(isPlacePickerEnabled({})).toBe(false);
    expect(isPlacePickerEnabled({ place_picker: "true" })).toBe(false);
    expect(isPlacePickerEnabled({ place_picker: true })).toBe(true);
  });
});

describe("PlacePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("makes no request under 3 characters", async () => {
    const fetchImpl = vi.fn(() => json(SUGGESTIONS));
    render(<Harness fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await type("ca");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("debounces and sends the Cape Town bbox / country / proximity", async () => {
    const fetchImpl = vi.fn(() => json(SUGGESTIONS));
    render(<Harness fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.change(screen.getByLabelText("Pickup"), { target: { value: "cap" } });
    fireEvent.change(screen.getByLabelText("Pickup"), { target: { value: "cape" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/search/searchbox/v1/suggest");
    expect(url.searchParams.get("bbox")).toBe("18.28,-34.25,19.20,-33.60");
    expect(url.searchParams.get("country")).toBe("za");
    expect(url.searchParams.get("proximity")).toBe("18.4241,-33.9249");
    expect(url.searchParams.get("q")).toBe("cape");
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("picking a suggestion fills editable text via retrieve", async () => {
    const fetchImpl = vi.fn((url: string) =>
      String(url).includes("/retrieve/")
        ? json({
            features: [
              {
                properties: {
                  name: "Cape Town International Airport",
                  place_formatted: "Matroosfontein, Cape Town",
                },
              },
            ],
          })
        : json(SUGGESTIONS)
    );
    render(<Harness fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await type("airport");
    fireEvent.mouseDown(screen.getByRole("option"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByTestId("value").textContent).toBe(
      "Cape Town International Airport, Matroosfontein"
    );
    expect(String(fetchImpl.mock.calls[1][0])).toContain("/retrieve/id-1");
  });

  it("free text always works when search fails", async () => {
    const fetchImpl = vi.fn(() => json({}, false, 500));
    render(<Harness fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await type("My cousin's farm stall");
    expect(screen.getByTestId("value").textContent).toBe("My cousin's farm stall");
    expect(screen.getByRole("status").textContent).toMatch(/type the place yourself/i);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("shows a friendly empty state and keeps typed text", async () => {
    const fetchImpl = vi.fn(() => json({ suggestions: [] }));
    render(<Harness fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await type("zzzzzz");
    expect(screen.getByRole("status").textContent).toMatch(/keep what you typed/i);
    expect(screen.getByTestId("value").textContent).toBe("zzzzzz");
  });

  it("is a plain input (no network) when the flag is off", async () => {
    const fetchImpl = vi.fn(() => json(SUGGESTIONS));
    render(<Harness fetchImpl={fetchImpl as unknown as typeof fetch} enabled={false} />);
    await type("cape town airport");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("value").textContent).toBe("cape town airport");
  });
});
