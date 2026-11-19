export type UploadEvent = { at: string; type?: string };

export function uploadLimitReached(events: UploadEvent[], now = Date.now()) {
  const hourAgo = now - 60 * 60 * 1000;
  const uploads = events.filter((event) => {
    if (event.type !== "upload") return false;
    const timestamp = new Date(event.at).getTime();
    return Number.isFinite(timestamp) && timestamp >= hourAgo && timestamp <= now;
  });
  return uploads.length >= 10;
}
