import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DriverLocationField } from "@/features/driver-portal/components/driver-location-field";
import { searchMapPlaces, verifyMapPlace } from "@/features/locations/lib/places-client";
import { proposeServiceLocation } from "@/services/locations.service";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/features/locations/lib/places-client", () => ({
  searchMapPlaces: vi.fn(),
  verifyMapPlace: vi.fn(),
}));

vi.mock("@/services/locations.service", () => ({
  proposeServiceLocation: vi.fn(),
}));

describe("DriverLocationField typed fallback", () => {
  afterEach(() => cleanup());

  it("offers a typed name after a map pick fails", async () => {
    vi.mocked(searchMapPlaces).mockResolvedValue([
      { placeId: "place-1", name: "Somewhere Far" },
    ]);
    vi.mocked(verifyMapPlace).mockResolvedValue({ outside: true });
    vi.mocked(proposeServiceLocation).mockResolvedValue({
      id: "loc-1",
      name: "Somewhere Far",
      needsReview: true,
    });

    const onChange = vi.fn();
    render(
      <DriverLocationField
        organisationId="org-1"
        label="Pickup"
        value={{ name: "", placeId: null, lat: null, lng: null, source: "" }}
        onChange={onChange}
        locations={[]}
        mapsEnabled
      />
    );

    fireEvent.change(screen.getByLabelText("Pickup"), {
      target: { value: "Somewhere Far" },
    });

    const mapButton = await screen.findByRole("button", { name: /Somewhere Far/ });
    fireEvent.click(mapButton);

    const typed = await screen.findByRole("button", {
      name: /admin will review/i,
    });
    expect(typed).toBeInTheDocument();

    fireEvent.click(typed);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Somewhere Far", source: "typed" })
      );
    });
  });

  it("ignores a map failure after the driver has changed the search", async () => {
    let finishOld: (value: { outside: true }) => void = () => {};
    vi.mocked(searchMapPlaces).mockImplementation(async (input: string) => [
      { placeId: input, name: input },
    ]);
    vi.mocked(verifyMapPlace).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    );

    render(
      <DriverLocationField
        organisationId="org-1"
        label="Pickup"
        value={{ name: "", placeId: null, lat: null, lng: null, source: "" }}
        onChange={vi.fn()}
        locations={[]}
        mapsEnabled
      />
    );

    const input = screen.getByPlaceholderText("Search places");
    fireEvent.change(input, { target: { value: "Old Place" } });
    fireEvent.click(await screen.findByRole("button", { name: /Old Place/ }));

    fireEvent.change(input, { target: { value: "New Place" } });
    await screen.findByRole("button", { name: /New Place/ });

    await act(async () => {
      finishOld({ outside: true });
    });

    expect(screen.queryByRole("button", { name: /admin will review/i })).toBeNull();
    expect(screen.getByRole("button", { name: /New Place/ })).toBeInTheDocument();
  });
});
