import { describe, expect, it } from "vitest";
import { olderThanFiveYears } from "../lib/storage";

describe("weekly data retention", () => {
  it("deletes only weeks older than five years", () => {
    expect(olderThanFiveYears("2021-11-17", "2026-11-18")).toBe(true);
    expect(olderThanFiveYears("2021-11-18", "2026-11-18")).toBe(false);
    expect(olderThanFiveYears("2021-11-19", "2026-11-18")).toBe(false);
  });
});
