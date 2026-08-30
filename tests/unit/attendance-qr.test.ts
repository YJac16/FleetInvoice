import { describe, expect, it } from "vitest";

import {
  boardingUrl,
  isTokenExpired,
} from "@/features/attendance/lib/qr";

describe("boardingUrl", () => {
  it("builds a deep link with encoded token", () => {
    expect(boardingUrl("http://localhost:3000", "abc+123")).toBe(
      "http://localhost:3000/employee/board?token=abc%2B123"
    );
  });

  it("strips trailing slash from app url", () => {
    expect(boardingUrl("https://app.example.com/", "tok")).toBe(
      "https://app.example.com/employee/board?token=tok"
    );
  });
});

describe("isTokenExpired", () => {
  it("returns true when expires_at is in the past", () => {
    expect(isTokenExpired("2020-01-01T00:00:00.000Z", Date.parse("2024-01-01"))).toBe(
      true
    );
  });

  it("returns false when expires_at is in the future", () => {
    expect(isTokenExpired("2099-01-01T00:00:00.000Z", Date.parse("2024-01-01"))).toBe(
      false
    );
  });
});
