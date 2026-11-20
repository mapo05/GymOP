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

type SupabaseGym = { id: string };
type SupabaseWeek = { week_start_date: string; upload: GymUpload };
type SupabaseSettings = { settings: GymSettings };

export function normalizeGymName(name: string) {
  return name.trim().toLowerCase();
}

function safeGymName(name: string) {
  return Buffer.from(normalizeGymName(name), "utf8").toString("base64url") || "unnamed";
}

function useSupabaseStorage() {
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (hasUrl !== hasKey) {
    throw new Error("Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use Supabase storage.");
  }
  return hasUrl && hasKey;
}

function useBlobStorage() {
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN && !useSupabaseStorage()) {
    throw new Error("Vercel Blob storage is not configured.");
  }
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server storage is not configured.");
  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseRequest<T>(
  endpoint: string,
  init: RequestInit = {},
  expectBody = true,
): Promise<T> {
  const { url, key } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${url}${endpoint}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Supabase storage request failed.", response.status, detail.slice(0, 500));
    throw new Error(`Supabase storage request failed (${response.status}).`);
  }
  if (!expectBody || response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function supabaseGymId(gymName: string): Promise<string> {
  const normalizedName = normalizeGymName(gymName);
  const rows = await supabaseRequest<SupabaseGym[]>(
    "/rest/v1/gyms?on_conflict=normalized_name&select=id",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ normalized_name: normalizedName, display_name: gymName.trim() }),
    },
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Supabase did not return a gym identifier.");
  return id;
}

function supabaseWeekQuery(gymId: string, week?: string) {
  const query = new URLSearchParams({
    select: "week_start_date,upload",
    gym_id: `eq.${gymId}`,
  });
  if (week) query.set("week_start_date", `eq.${week}`);
  return `/rest/v1/weekly_uploads?${query.toString()}`;
}

async function supabaseFindWeek(gymName: string, week: string) {
  const gymId = await supabaseGymId(gymName);
  const rows = await supabaseRequest<SupabaseWeek[]>(
    supabaseWeekQuery(gymId, week),
    { method: "GET" },
  );
  return rows[0]?.upload ?? null;
}

async function supabaseSaveWeek(upload: GymUpload) {
  const gymId = await supabaseGymId(upload.gymName);
  await supabaseRequest(
    "/rest/v1/weekly_uploads?on_conflict=gym_id,week_start_date",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        gym_id: gymId,
        week_start_date: upload.weekStartDate,
        upload,
        uploaded_at: upload.uploadedAt,
      }),
    },
    false,
  );
}

async function supabaseListWeeks(gymName: string): Promise<GymUpload[]> {
  const gymId = await supabaseGymId(gymName);
  const rows = await supabaseRequest<SupabaseWeek[]>(supabaseWeekQuery(gymId), { method: "GET" });
  const expired = rows.filter((row) => olderThanFiveYears(row.week_start_date));
  for (const row of expired) {
    const query = new URLSearchParams({
      gym_id: `eq.${gymId}`,
      week_start_date: `eq.${row.week_start_date}`,
    });
    await supabaseRequest(`/rest/v1/weekly_uploads?${query.toString()}`, { method: "DELETE" }, false);
  }
  return rows
    .filter((row) => !olderThanFiveYears(row.week_start_date))
    .map((row) => row.upload)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
}

async function supabaseGetSettings(gymName: string): Promise<GymSettings> {
  const gymId = await supabaseGymId(gymName);
  const query = new URLSearchParams({ select: "settings", gym_id: `eq.${gymId}` });
  const rows = await supabaseRequest<SupabaseSettings[]>(
    `/rest/v1/gym_settings?${query.toString()}`,
    { method: "GET" },
  );
  return rows[0]?.settings
    ? { ...emptySettings(), ...rows[0].settings }
    : emptySettings();
}

async function supabaseSaveSettings(gymName: string, settings: GymSettings) {
  const gymId = await supabaseGymId(gymName);
  await supabaseRequest(
    "/rest/v1/gym_settings?on_conflict=gym_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ gym_id: gymId, settings }),
    },
    false,
  );
}

function supabaseFloorPlanPath(gymId: string) {
  return `${gymId}/floor-plan.png`;
}

async function supabaseGetFloorPlan(gymName: string) {
  const gymId = await supabaseGymId(gymName);
  const { url, key } = supabaseConfig();
  const response = await fetch(
    `${url}/storage/v1/object/floor-plans/${supabaseFloorPlanPath(gymId)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    console.error("Supabase floor-plan download failed.", response.status);
    throw new Error(`Supabase floor-plan download failed (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function supabaseSaveFloorPlan(gymName: string, image: Buffer) {
  const gymId = await supabaseGymId(gymName);
  const { url, key } = supabaseConfig();
  const response = await fetch(
    `${url}/storage/v1/object/floor-plans/${supabaseFloorPlanPath(gymId)}`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "image/png",
        "x-upsert": "true",
      },
      body: new Uint8Array(image),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Supabase floor-plan upload failed.", response.status, detail.slice(0, 500));
    throw new Error(`Supabase floor-plan upload failed (${response.status}).`);
  }
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
  if (useSupabaseStorage()) return supabaseFindWeek(gymName, week);
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
  if (useSupabaseStorage()) return supabaseSaveWeek(upload);
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
  if (useSupabaseStorage()) return supabaseListWeeks(gymName);
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
  if (useSupabaseStorage()) return supabaseGetSettings(gymName);
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
  if (useSupabaseStorage()) return supabaseSaveSettings(gymName, settings);
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
  if (useSupabaseStorage()) return supabaseGetFloorPlan(gymName);
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
  if (useSupabaseStorage()) return supabaseSaveFloorPlan(gymName, image);
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
