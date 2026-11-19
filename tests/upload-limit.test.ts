import { describe, expect, it } from "vitest";
import { uploadLimitReached } from "../lib/upload-limit";

describe("per-gym upload limit", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");

  it("blocks the 11th upload in a rolling hour", () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      type: "upload",
      at: new Date(now - index * 1000).toISOString(),
    }));
    expect(uploadLimitReached(events, now)).toBe(true);
  });

  it("allows fewer than 10 recent uploads and ignores unrelated or older events", () => {
    const events = [
      ...Array.from({ length: 9 }, (_, index) => ({
        type: "upload",
        at: new Date(now - index * 1000).toISOString(),
      })),
      { type: "limit", at: new Date(now - 1000).toISOString() },
      { type: "upload", at: new Date(now - 60 * 60 * 1000 - 1).toISOString() },
    ];
    expect(uploadLimitReached(events, now)).toBe(false);
  });
});
