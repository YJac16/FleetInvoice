import { describe, expect, it } from "vitest";

import { canTransition, nextStatus } from "@/features/trips/lib/transitions";
import { TRIP_STATUSES } from "@/lib/constants";

describe("canTransition / nextStatus", () => {
  describe("started", () => {
    it("allows starting from planned or assigned", () => {
      expect(canTransition("planned", "started")).toBe(true);
      expect(canTransition("assigned", "started")).toBe(true);
      expect(nextStatus("planned", "started")).toBe("in_progress");
      expect(nextStatus("assigned", "started")).toBe("in_progress");
    });

    it("disallows starting from in_progress, completed, or cancelled", () => {
      expect(canTransition("in_progress", "started")).toBe(false);
      expect(canTransition("completed", "started")).toBe(false);
      expect(canTransition("cancelled", "started")).toBe(false);
      expect(nextStatus("in_progress", "started")).toBeNull();
    });
  });

  describe("arrived_stop", () => {
    it("only allows arriving while in_progress", () => {
      expect(canTransition("in_progress", "arrived_stop")).toBe(true);
      expect(nextStatus("in_progress", "arrived_stop")).toBe("in_progress");
    });

    it("disallows arriving from any other status", () => {
      for (const status of TRIP_STATUSES) {
        if (status === "in_progress") continue;
        expect(canTransition(status, "arrived_stop")).toBe(false);
        expect(nextStatus(status, "arrived_stop")).toBeNull();
      }
    });
  });

  describe("completed", () => {
    it("allows completing from in_progress or assigned", () => {
      expect(canTransition("in_progress", "completed")).toBe(true);
      expect(canTransition("assigned", "completed")).toBe(true);
      expect(nextStatus("in_progress", "completed")).toBe("completed");
      expect(nextStatus("assigned", "completed")).toBe("completed");
    });

    it("disallows completing from planned, completed, or cancelled", () => {
      expect(canTransition("planned", "completed")).toBe(false);
      expect(canTransition("completed", "completed")).toBe(false);
      expect(canTransition("cancelled", "completed")).toBe(false);
    });
  });

  describe("cancelled", () => {
    it("allows cancelling from planned, assigned, or in_progress", () => {
      expect(canTransition("planned", "cancelled")).toBe(true);
      expect(canTransition("assigned", "cancelled")).toBe(true);
      expect(canTransition("in_progress", "cancelled")).toBe(true);
      expect(nextStatus("planned", "cancelled")).toBe("cancelled");
    });

    it("disallows cancelling an already finished trip", () => {
      expect(canTransition("completed", "cancelled")).toBe(false);
      expect(canTransition("cancelled", "cancelled")).toBe(false);
      expect(nextStatus("completed", "cancelled")).toBeNull();
      expect(nextStatus("cancelled", "cancelled")).toBeNull();
    });
  });

  describe("assigned event", () => {
    it("is not a client-triggerable transition_trip event", () => {
      for (const status of TRIP_STATUSES) {
        expect(canTransition(status, "assigned")).toBe(false);
        expect(nextStatus(status, "assigned")).toBeNull();
      }
    });
  });
});
