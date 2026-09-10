import { describe, expect, it } from "vitest";

import {
  boardingUrl,
  driverQrUrl,
  extractTokenFromPayload,
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

describe("extractTokenFromPayload", () => {
  it("reads token from a boarding URL", () => {
    expect(
      extractTokenFromPayload("https://app.example.com/employee/board?token=abc123")
    ).toBe("abc123");
  });

  it("reads driverToken from a pairing URL", () => {
    expect(
      extractTokenFromPayload(
        "https://app.example.com/employee/board?driverToken=drv99"
      )
    ).toBe("drv99");
  });

  it("returns raw strings that are not URLs", () => {
    expect(extractTokenFromPayload("  ABCD1234  ")).toBe("ABCD1234");
  });
});

describe("driverQrUrl", () => {
  it("builds a pairing deep link", () => {
    expect(driverQrUrl("https://app.example.com/", "tok")).toBe(
      "https://app.example.com/employee/board?driverToken=tok"
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
