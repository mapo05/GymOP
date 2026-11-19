import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import type { GymUpload } from "./story1";

export type GymSettings = {
  limits: Record<string, number>;
  placements: Record<string, { x: number; y: number }>;
  hasFloorPlan: boolean;
  events: { at: string; message: string; type?: string }[];
};

const emptySettings = (): GymSettings => ({
  limits: {},
  placements: {},
  hasFloorPlan: false,
  events: [],
});

export function normalizeGymName(name: string) {
  return name.trim().toLowerCase();
}

function safeGymName(name: string) {
  return Buffer.from(normalizeGymName(name), "utf8").toString("base64url") || "unnamed";
}

function useBlobStorage() {
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Vercel Blob storage is not configured.");
  }
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function localDirectory(gymName: string) {
  return path.join(process.cwd(), ".gymop-data", safeGymName(gymName));
}

function blobPath(gymName: string, week: string) {
  return `gymop/${safeGymName(gymName)}/${week}.json`;
}

function settingsFile(gymName: string) {
  return path.join(localDirectory(gymName), "settings.json");
}

function settingsBlob(gymName: string) {
  return `gymop/${safeGymName(gymName)}/settings.json`;
}

function floorPlanFile(gymName: string) {
  return path.join(localDirectory(gymName), "floor-plan.png");
}

function floorPlanBlob(gymName: string) {
  return `gymop/${safeGymName(gymName)}/floor-plan.png`;
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function olderThanFiveYears(week: string, today = new Date().toISOString().slice(0, 10)) {
  const date = new Date(`${week}T00:00:00Z`);
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  return !Number.isNaN(date.getTime()) && date < cutoff;
}

async function getBlobText(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  return result ? new Response(result.stream).text() : null;
}

export async function findWeek(gymName: string, week: string): Promise<GymUpload | null> {
  if (useBlobStorage()) {
    const text = await getBlobText(blobPath(gymName, week));
    return text ? (JSON.parse(text) as GymUpload) : null;
  }

  try {
    const text = await readFile(path.join(localDirectory(gymName), `${week}.json`), "utf8");
    return JSON.parse(text) as GymUpload;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function saveWeek(upload: GymUpload) {
  if (useBlobStorage()) {
    await put(blobPath(upload.gymName, upload.weekStartDate), JSON.stringify(upload), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  const directory = localDirectory(upload.gymName);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `${upload.weekStartDate}.json`),
    JSON.stringify(upload, null, 2),
    "utf8",
  );
}

export async function listWeeks(gymName: string): Promise<GymUpload[]> {
  if (useBlobStorage()) {
    const prefix = `gymop/${safeGymName(gymName)}/`;
    const result = await list({ prefix });
    const records = result.blobs.filter((blob) => /^\d{4}-\d{2}-\d{2}\.json$/.test(path.posix.basename(blob.pathname)));
    const expired = records.filter((blob) => olderThanFiveYears(path.posix.basename(blob.pathname).slice(0, 10)));
    if (expired.length) await del(expired.map((blob) => blob.pathname));
    const uploads = await Promise.all(
      records
        .filter((blob) => !olderThanFiveYears(path.posix.basename(blob.pathname).slice(0, 10)))
        .map(async (blob) => {
          const data = await get(blob.url, { access: "private", useCache: false });
          return data ? (JSON.parse(await new Response(data.stream).text()) as GymUpload) : null;
        }),
    );
    return uploads
      .filter((item): item is GymUpload => item !== null)
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
  }

  const fs = await import("node:fs/promises");
  let names: string[];
  try {
    names = await fs.readdir(localDirectory(gymName));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
  const uploads: GymUpload[] = [];
  for (const name of names) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    const week = name.slice(0, 10);
    if (olderThanFiveYears(week)) {
      await unlink(path.join(localDirectory(gymName), name));
      continue;
    }
    const text = await readFile(path.join(localDirectory(gymName), name), "utf8");
    uploads.push(JSON.parse(text) as GymUpload);
  }
  return uploads.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
}

export async function getGymSettings(gymName: string): Promise<GymSettings> {
  if (useBlobStorage()) {
    const text = await getBlobText(settingsBlob(gymName));
    return text ? ({ ...emptySettings(), ...JSON.parse(text) } as GymSettings) : emptySettings();
  }
  try {
    const text = await readFile(settingsFile(gymName), "utf8");
    return { ...emptySettings(), ...JSON.parse(text) } as GymSettings;
  } catch (error) {
    if (isMissingFile(error)) return emptySettings();
    throw error;
  }
}

export async function saveGymSettings(gymName: string, settings: GymSettings) {
  if (useBlobStorage()) {
    await put(settingsBlob(gymName), JSON.stringify(settings), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  const directory = localDirectory(gymName);
  await mkdir(directory, { recursive: true });
  await writeFile(settingsFile(gymName), JSON.stringify(settings, null, 2), "utf8");
}

export async function getFloorPlan(gymName: string) {
  if (useBlobStorage()) {
    const result = await get(floorPlanBlob(gymName), { access: "private", useCache: false });
    return result ? Buffer.from(await new Response(result.stream).arrayBuffer()) : null;
  }
  try {
    return await readFile(floorPlanFile(gymName));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function saveFloorPlan(gymName: string, image: Buffer) {
  if (useBlobStorage()) {
    await put(floorPlanBlob(gymName), image, {
      access: "private",
      allowOverwrite: true,
      contentType: "image/png",
    });
    return;
  }
  const directory = localDirectory(gymName);
  await mkdir(directory, { recursive: true });
  await writeFile(floorPlanFile(gymName), image);
}
