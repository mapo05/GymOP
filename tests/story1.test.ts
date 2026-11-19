import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  parseUploadedData,
  validateRawRows,
  weekendCategory,
  REQUIRED_COLUMNS,
  type GymUpload,
} from "../lib/story1";

const headers = REQUIRED_COLUMNS.join(",");
const validCsv = `${headers}\n2026-11-16,Treadmill,10,Early morning,Monday,90,1800`;

describe("Story 1 upload acceptance", () => {
  it("uploads a valid CSV and reports the saved row count", async () => {
    const parsed = await parseUploadedData(validCsv, "week.csv", "Gym A");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].equipmentName).toBe("Treadmill");
    expect(parsed.rowsSaved).toBe(1);
  });

  it("uploads a valid XLSX file", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Weekly data");
    sheet.addRow([...REQUIRED_COLUMNS]);
    sheet.addRow(["2026-11-16", "Treadmill", 10, "Early morning", "Monday", 90, 1800]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseUploadedData(buffer, "week.xlsx", "Gym A");
    expect(parsed.rowsSaved).toBe(1);
    expect(parsed.rows[0].weekStartDate).toBe("2026-11-16");
  });

  it("reads a valid XLSX workbook that uses an Excel table", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Weekly data");
    sheet.addTable({
      name: "WeeklyData",
      ref: "A1",
      headerRow: true,
      columns: REQUIRED_COLUMNS.map((name) => ({ name })),
      rows: [["2026-11-16", "Treadmill", 10, "Early morning", "Monday", 90, 1800]],
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseUploadedData(buffer, "week.xlsx", "Gym A");
    expect(parsed.rowsSaved).toBe(1);
    expect(parsed.rows[0].equipmentName).toBe("Treadmill");
  });

  it("rejects formulas in an XLSX file", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Weekly data");
    sheet.addRow([...REQUIRED_COLUMNS]);
    sheet.addRow(["2026-11-16", { formula: "1+1", result: 2 }, 10, "Early morning", "Monday", 90, 1800]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseUploadedData(buffer, "week.xlsx", "Gym A")).rejects.toThrow("Formula cells");
  });

  it("rejects a missing required column and names it", () => {
    const result = validateRawRows([
      {
        "week start date": "2026-11-16",
        "equipment name": "Treadmill",
        "number owned": 10,
        "time of day": "Early morning",
        "day type": "Monday",
        "total people": 90,
      },
    ]);
    expect(result.errors.join(" ")).toContain("total minutes");
  });

  it("rejects a bad file with no partial save", () => {
    const result = validateRawRows([
      {
        "week start date": "2026-11-16",
        "equipment name": "Treadmill",
        "number owned": 10,
        "time of day": "Early morning",
        "day type": "Monday",
        "total people": 90,
        "total minutes": 1800,
      },
      {
        "week start date": "2026-11-16",
        "equipment name": "Bench",
        "number owned": 0,
        "time of day": "Morning",
        "day type": "Tuesday",
        "total people": 20,
        "total minutes": 400,
      },
    ]);
    expect(result.errors.join(" ")).toContain("row 3");
    expect(result.rows).toEqual([]);
  });

  it("rejects unknown time names and lists all five choices", () => {
    const result = validateRawRows([
      {
        "week start date": "2026-11-16",
        "equipment name": "Treadmill",
        "number owned": 10,
        "time of day": "Noon",
        "day type": "Monday",
        "total people": 90,
        "total minutes": 1800,
      },
    ]);
    expect(result.errors.join(" ")).toContain("Early morning");
    expect(result.errors.join(" ")).toContain("Late-night");
  });

  it("rejects negative, decimal, blank, or nonnumeric values and zero-owned machines", () => {
    const badValues = [-1, 1.5, "", "abc", 0];
    for (const value of badValues) {
      const result = validateRawRows([
        {
          "week start date": "2026-11-16",
          "equipment name": "Bench",
          "number owned": value,
          "time of day": "Mid-day",
          "day type": "Wednesday",
          "total people": 20,
          "total minutes": 400,
        },
      ]);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects minutes above zero when people are zero", () => {
    const result = validateRawRows([
      {
        "week start date": "2026-11-16",
        "equipment name": "Bench",
        "number owned": 1,
        "time of day": "Mid-day",
        "day type": "Wednesday",
        "total people": 0,
        "total minutes": 400,
      },
    ]);
    expect(result.errors.join(" ")).toContain("total people");
  });

  it("accepts Monday-Thursday as weekday and Friday-Sunday as weekend", () => {
    expect(weekendCategory("Monday")).toBe("weekday");
    expect(weekendCategory("Thursday")).toBe("weekday");
    expect(weekendCategory("Friday")).toBe("weekend");
    expect(weekendCategory("Sunday")).toBe("weekend");
  });

  it("rejects more than 5000 rows", async () => {
    const oversized = `${headers}\n${Array.from({ length: 5001 }, () => "2026-11-16,Treadmill,10,Early morning,Monday,90,1800").join("\n")}`;
    await expect(parseUploadedData(oversized, "week.csv", "Gym A")).rejects.toThrow(
      "5,000 rows",
    );
  });

  it("rejects personal-data columns and formula text", () => {
    const result = validateRawRows([
      {
        "week start date": "2026-11-16",
        "equipment name": "=SUM(A1:A2)",
        "number owned": 10,
        "time of day": "Early morning",
        "day type": "Monday",
        "total people": 90,
        "total minutes": 1800,
        "member name": "Sam",
      },
    ]);
    expect(result.errors.join(" ").toLowerCase()).toContain("personal");
    expect(result.errors.join(" ")).toContain("formula");
  });

  it("rejects duplicate daily rows for the same machine and time", () => {
    const result = validateRawRows([
      {
        "week start date": "2026-11-16",
        "equipment name": "Treadmill",
        "number owned": 10,
        "time of day": "Early morning",
        "day type": "Monday",
        "total people": 90,
        "total minutes": 1800,
      },
      {
        "week start date": "2026-11-16",
        "equipment name": "treadmill",
        "number owned": 10,
        "time of day": "Early morning",
        "day type": "Monday",
        "total people": 20,
        "total minutes": 400,
      },
    ]);
    expect(result.errors.join(" ")).toContain("already has a row");
    expect(result.rows).toEqual([]);
  });

  it("rejects file contents that do not match the file extension", async () => {
    await expect(parseUploadedData(validCsv, "week.xlsx", "Gym A")).rejects.toThrow(
      "contents do not match",
    );
  });
});
