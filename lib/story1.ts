import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { Readable } from "node:stream";

export const REQUIRED_COLUMNS = [
  "week start date",
  "equipment name",
  "number owned",
  "time of day",
  "day type",
  "total people",
  "total minutes",
] as const;

export const TIME_NAMES = [
  "Early morning",
  "Morning",
  "Mid-day",
  "Evening",
  "Late-night",
] as const;

export type UploadRow = {
  weekStartDate: string;
  equipmentName: string;
  numberOwned: number;
  timeOfDay: string;
  dayType: string;
  dayCategory: "weekday" | "weekend";
  totalPeople: number;
  totalMinutes: number;
};

export type GymUpload = {
  gymName: string;
  weekStartDate: string;
  rows: UploadRow[];
  uploadedAt: string;
};

type ValidationResult = {
  rows: UploadRow[];
  errors: string[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDay(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function weekendCategory(day: string): "weekday" | "weekend" {
  const normalized = normalizeDay(day);
  return ["Friday", "Saturday", "Sunday"].includes(normalized)
    ? "weekend"
    : "weekday";
}

function isWholeNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && Number.isInteger(number);
}

function formulaText(value: unknown) {
  if (typeof value === "number") return false;
  const text = String(value ?? "").trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
  return /^[=+\-@]/.test(text);
}

function canonicalTime(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return TIME_NAMES.find((name) => name.toLowerCase() === text);
}

function validDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return !Number.isNaN(date.getTime());
  }
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }
  return false;
}

function weekDateText(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  return String(value ?? "").trim();
}

export function validateRawRows(rawRows: Record<string, unknown>[]): ValidationResult {
  const errors: string[] = [];
  if (rawRows.length === 0) {
    return { rows: [], errors: ["The file is empty. Add at least one data row and try again."] };
  }

  const headers = new Set(Object.keys(rawRows[0]).map(normalizeHeader));
  const missing = REQUIRED_COLUMNS.filter((required) => !headers.has(required));
  if (missing.length) {
    errors.push(`Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  }

  const extras = [...headers].filter(
    (header) =>
      header && !REQUIRED_COLUMNS.includes(header as (typeof REQUIRED_COLUMNS)[number]),
  );
  const personalColumns = extras.filter((header) =>
    /\b(member|email|phone|address|birth|personal|check.?in|customer)\b/.test(header),
  );
  const otherExtras = extras.filter((header) => !personalColumns.includes(header));
  if (personalColumns.length > 0) {
    errors.push(
      `Personal information is not accepted. Remove these columns: ${personalColumns.join(", ")}.`,
    );
  }
  if (otherExtras.length > 0) {
    errors.push(`Extra columns are not accepted: ${otherExtras.join(", ")}. Remove them or rename them to the required columns.`);
  }

  const seenDays = new Set<string>();
  const ownedByEquipment = new Map<string, number>();
  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    for (const [column, value] of Object.entries(row)) {
      if (formulaText(value)) {
        errors.push(`row ${index + 2}, ${normalizeHeader(column)}: formula text is not allowed.`);
      }
    }
    const equipmentKey = Object.keys(row).find(
      (key) => normalizeHeader(key) === "equipment name",
    );
    if (equipmentKey && formulaText(row[equipmentKey])) {
      errors.push(`row ${index + 2}, equipment name: formula text is not allowed.`);
    }
  }

  if (errors.length > 0) return { rows: [], errors };

  const normalizedRows: UploadRow[] = [];
  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const get = (header: string) => {
      const key = Object.keys(row).find((key) => normalizeHeader(key) === header);
      return key ? row[key] : undefined;
    };

    const week = get("week start date");
    const equipment = get("equipment name");
    const owned = get("number owned");
    const time = canonicalTime(get("time of day"));
    const day = normalizeDay(get("day type"));
    const people = get("total people");
    const minutes = get("total minutes");

    if (String(equipment ?? "").trim() && time && day) {
      const dailyKey = `${String(equipment).trim().toLowerCase()}|${time.toLowerCase()}|${day.toLowerCase()}`;
      if (seenDays.has(dailyKey)) {
        errors.push(`row ${rowNumber}, equipment name: this machine already has a row for ${time} on ${day}. Keep one row per machine, time, and day.`);
      }
      seenDays.add(dailyKey);
    }
    if (String(equipment ?? "").trim() && isWholeNumber(owned)) {
      const key = String(equipment).trim().toLowerCase();
      const previousOwned = ownedByEquipment.get(key);
      if (previousOwned !== undefined && previousOwned !== Number(owned)) {
        errors.push(`row ${rowNumber}, number owned: use the same machine count for ${equipment} throughout the week.`);
      }
      ownedByEquipment.set(key, Number(owned));
    }

    if (!validDate(week)) errors.push(`row ${rowNumber}, week start date: use a date in YYYY-MM-DD format.`);
    if (String(equipment ?? "").trim() === "") {
      errors.push(`row ${rowNumber}, equipment name: enter an equipment name.`);
    }
    if (!isWholeNumber(owned) || Number(owned) < 1) {
      errors.push(`row ${rowNumber}, number owned: enter a whole number of 1 or more.`);
    }
    if (!time) {
      errors.push(`row ${rowNumber}, time of day: use ${TIME_NAMES.join(", ")}.`);
    }
    if (!["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(day)) {
      errors.push(`row ${rowNumber}, day type: use Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday.`);
    }
    if (!isWholeNumber(people) || Number(people) < 0) {
      errors.push(`row ${rowNumber}, total people: enter a whole number of 0 or more.`);
    }
    if (!isWholeNumber(minutes) || Number(minutes) < 0) {
      errors.push(`row ${rowNumber}, total minutes: enter a whole number of 0 or more.`);
    }
    if (isWholeNumber(people) && Number(people) === 0 && isWholeNumber(minutes) && Number(minutes) > 0) {
      errors.push(`row ${rowNumber}, total people: enter more than 0 when total minutes is above 0.`);
    }

    if (
      validDate(week) &&
      String(equipment ?? "").trim() &&
      !formulaText(equipment) &&
      isWholeNumber(owned) &&
      Number(owned) >= 1 &&
      time &&
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(day) &&
      isWholeNumber(people) &&
      Number(people) >= 0 &&
      isWholeNumber(minutes) &&
      Number(minutes) >= 0 &&
      !(Number(people) === 0 && Number(minutes) > 0)
    ) {
      normalizedRows.push({
        weekStartDate: weekDateText(week),
        equipmentName: String(equipment).trim(),
        numberOwned: Number(owned),
        timeOfDay: time,
        dayType: day,
        dayCategory: weekendCategory(day),
        totalPeople: Number(people),
        totalMinutes: Number(minutes),
      });
    }
  });

  return { rows: errors.length ? [] : normalizedRows, errors };
}

export async function parseUploadedData(
  input: string | Buffer | Uint8Array,
  fileName: string,
  gymName: string,
  rowLimit = 5000,
): Promise<GymUpload & { rowsSaved: number }> {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error("Choose a .xlsx or .csv file.");
  }
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const hasBinaryContent = buffer.includes(0);
  if ((extension === "xlsx" && !isZip) || (extension === "csv" && (isZip || hasBinaryContent))) {
    throw new Error("The file contents do not match its .xlsx or .csv type. Choose a valid spreadsheet.");
  }

  let rawRows: Record<string, unknown>[];
  if (extension === "csv") {
    let records: string[][];
    try {
      records = parseCsv(buffer.toString("utf8"), {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: false,
      });
    } catch {
      throw new Error("The CSV file could not be read. Check its rows and columns, then upload it again.");
    }
    const [columns, ...values] = records;
    if (!columns?.length) throw new Error("The file is empty. Add column names and data rows, then try again.");
    const normalizedColumns = columns.map(normalizeHeader);
    if (new Set(normalizedColumns).size !== normalizedColumns.length) {
      throw new Error("The file has duplicate column names. Give each column a different name.");
    }
    rawRows = values.map((valuesRow) =>
      Object.fromEntries(columns.map((column, index) => [column, valuesRow[index] ?? ""])),
    );
  } else {
    if (buffer.includes(Buffer.from("vbaProject.bin"))) {
      throw new Error("Macros are not allowed. Save a copy without macros and upload it again.");
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.read(Readable.from([buffer]), { ignoreNodes: ["tableParts"] });
    } catch (error) {
      console.error(
        "Could not read an uploaded .xlsx workbook.",
        error instanceof Error ? error.message : "Unknown spreadsheet read error.",
      );
      throw new Error("The Excel file could not be read. Save it as a valid .xlsx file and upload it again.");
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("The file has no worksheet. Add a spreadsheet with data and try again.");
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.type === ExcelJS.ValueType.Formula) {
          throw new Error("Formula cells are not allowed. Replace formulas with plain values and upload again.");
        }
      });
      rows.push(row.values as unknown[]);
    });
    const [headerValues, ...dataRows] = rows;
    if (!headerValues?.length) throw new Error("The file is empty. Add column names and data rows, then try again.");
    const columns = headerValues.slice(1).map((value) => String(value ?? ""));
    if (new Set(columns.map(normalizeHeader)).size !== columns.length) {
      throw new Error("The file has duplicate column names. Give each column a different name.");
    }
    rawRows = dataRows.map((valuesRow) =>
      Object.fromEntries(
        columns.map((column, index) => [column, valuesRow[index + 1] ?? ""]),
      ),
    );
  }

  if (rawRows.length > rowLimit) throw new Error("The file has more than 5,000 rows. Split it into smaller files.");

  const result = validateRawRows(rawRows);
  if (result.errors.length) throw new Error(result.errors.join("\n"));

  const weekStartDate = result.rows[0]?.weekStartDate;
  if (!weekStartDate) throw new Error("The file does not contain a valid week start date.");
  if (result.rows.some((row) => row.weekStartDate !== weekStartDate)) {
    throw new Error("All rows in one upload must use the same week start date.");
  }

  return {
    gymName: gymName.trim(),
    weekStartDate,
    rows: result.rows,
    rowsSaved: result.rows.length,
    uploadedAt: new Date().toISOString(),
  };
}
