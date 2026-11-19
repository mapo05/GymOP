import { describe, expect, it } from "vitest";
import {
  calculateResults,
  type AnalyticsOptions,
} from "../lib/analytics";
import type { UploadRow } from "../lib/story1";

function row(
  equipmentName: string,
  dayType: string,
  timeOfDay: string,
  totalPeople: number,
  totalMinutes: number,
  numberOwned = 1,
  weekStartDate = "2026-11-16",
): UploadRow {
  return {
    weekStartDate,
    equipmentName,
    numberOwned,
    timeOfDay,
    dayType,
    dayCategory: ["Friday", "Saturday", "Sunday"].includes(dayType) ? "weekend" : "weekday",
    totalPeople,
    totalMinutes,
  };
}

const base: AnalyticsOptions = {
  weekendView: "same",
  weekCount: 1,
  limits: {},
  today: "2026-11-18",
};

describe("congestion scores and recommendations", () => {
  it("uses the time band hours and treats exactly the limit as not backed up", () => {
    const results = calculateResults([
      row("Treadmill", "Monday", "Early morning", 90, 1800, 10),
    ], base);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      peoplePerHour: 30,
      minutesPerPerson: 20,
      points: 12,
      status: "Not backed up",
    });
  });

  it("uses unrounded points for the backed-up decision and rounds extra capacity up", () => {
    const result = calculateResults([
      row("Treadmill", "Monday", "Early morning", 91, 1820, 10),
    ], base)[0];
    expect(result.points).toBeCloseTo(12.133333);
    expect(result.status).toBe("Backed up");
    expect(result.extraMachines).toBe(1);
  });

  it("ranks machine types and recommends only those above their limit", () => {
    const results = calculateResults([
      row("Treadmill", "Monday", "Early morning", 90, 1800, 10),
      row("Squat Rack", "Monday", "Early morning", 30, 900, 2),
      row("Cable Machine", "Tuesday", "Morning", 24, 240, 4),
      row("Bench", "Wednesday", "Mid-day", 48, 480, 1),
      row("Leg Press", "Thursday", "Evening", 36, 720, 2),
      row("Rowing Machine", "Friday", "Mid-day", 0, 0, 3),
    ], base);

    expect(results.filter((result) => result.recommendation)).toHaveLength(3);
    expect(results.find((result) => result.equipmentName === "Squat Rack")).toMatchObject({
      points: 30,
      extraMachines: 3,
      recommendation: "Add capacity for Squat Rack during Early morning.",
    });
    expect(results.find((result) => result.equipmentName === "Bench")?.extraMachines).toBe(1);
    expect(results.find((result) => result.equipmentName === "Leg Press")?.extraMachines).toBe(2);
    expect(results.filter((result) => result.timeOfDay === "Early morning").map((item) => item.equipmentName))
      .toEqual(["Squat Rack", "Treadmill"]);
  });

  it("averages each day group, then combines weekdays and weekends in a 4:3 ratio", () => {
    const dailyRows = [
      ...["Monday", "Tuesday", "Wednesday", "Thursday"].map((day) =>
        row("Treadmill", day, "Early morning", 90, 1800, 10),
      ),
      ...["Friday", "Saturday", "Sunday"].map((day) =>
        row("Treadmill", day, "Early morning", 60, 1200, 10),
      ),
    ];
    const result = calculateResults(dailyRows, base)[0];

    expect(result.peoplePerHour).toBeCloseTo((90 * 4 + 60 * 3) / 7 / 3);
    expect(result.minutesPerPerson).toBe(20);
    expect(result.points).toBeCloseTo(10.285714);
  });

  it("shows weekday and weekend results separately when requested", () => {
    const results = calculateResults([
      row("Treadmill", "Monday", "Early morning", 90, 1800, 10),
      row("Treadmill", "Saturday", "Early morning", 60, 1200, 10),
    ], { ...base, weekendView: "separate" });

    expect(results.map((result) => [result.dayCategory, result.peoplePerHour, result.points])).toEqual([
      ["weekday", 30, 12],
      ["weekend", 20, 8],
    ]);
  });

  it("averages weekly totals before scoring over the selected number of weeks", () => {
    const results = calculateResults([
      row("Treadmill", "Monday", "Early morning", 90, 1800, 10, "2026-11-09"),
      row("Treadmill", "Monday", "Early morning", 110, 2200, 10, "2026-11-16"),
    ], { ...base, weekCount: 2 });

    expect(results[0].peoplePerHour).toBeCloseTo(100 / 3);
    expect(results[0].minutesPerPerson).toBe(20);
    expect(results[0].points).toBeCloseTo(13.333333);
    expect(results[0].extraMachines).toBe(2);
  });

  it("applies a gym-specific machine limit immediately", () => {
    const results = calculateResults([
      row("Cable Machine", "Monday", "Morning", 24, 240, 4),
    ], { ...base, limits: { "cable machine": 3 } });

    expect(results[0]).toMatchObject({ points: 4, limit: 3, status: "Backed up" });
  });

  it("returns no extra-machine recommendations when everything is within limit", () => {
    const results = calculateResults([
      row("Treadmill", "Monday", "Early morning", 90, 1800, 10),
    ], base);
    expect(results[0].recommendation).toBeNull();
    expect(results[0].extraMachines).toBeNull();
  });

  it("marks data older than two weeks as stale", () => {
    const result = calculateResults([
      row("Treadmill", "Monday", "Early morning", 90, 1800, 10, "2026-11-02"),
    ], { ...base, today: "2026-11-18" });
    expect(result[0].isStale).toBe(true);
  });
});
