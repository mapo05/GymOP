import { NextRequest, NextResponse } from "next/server";
import { parseUploadedData, type GymUpload } from "@/lib/story1";
import { uploadLimitReached } from "@/lib/upload-limit";
import {
  findWeek,
  getGymSettings,
  normalizeGymName,
  saveGymSettings,
  saveWeek,
  type GymSettings,
} from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let upload: GymUpload & { rowsSaved: number };
  let normalizedGym = "";
  let displayGymName = "";
  let replace = false;
  try {
    const form = await request.formData();
    const gymName = String(form.get("gymName") ?? "").trim();
    const file = form.get("file");
    replace = form.get("replace") === "true";

    if (!gymName) {
      return NextResponse.json({ error: "Enter your gym name." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an .xlsx or .csv file." }, { status: 400 });
    }

    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "xlsx" && extension !== "csv") {
      return NextResponse.json({ error: "Choose a file with an .xlsx or .csv name." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "The file is larger than 5 MB. Choose a smaller file." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    upload = await parseUploadedData(bytes, file.name, gymName);
    normalizedGym = normalizeGymName(gymName);
    displayGymName = gymName;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file could not be uploaded.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let existing: GymUpload | null = null;
  let settings: GymSettings;
  try {
    existing = await findWeek(normalizedGym, upload.weekStartDate);

    if (existing && !replace) {
      return NextResponse.json(
        { error: "Data already exists for this week. Replace this week's data or cancel." },
        { status: 409 },
      );
    }

    settings = await getGymSettings(normalizedGym);
    if (uploadLimitReached(settings.events)) {
      return NextResponse.json(
        { error: "This gym has reached 10 uploads in the last hour. Please wait and try again." },
        { status: 429 },
      );
    }

    await saveWeek({ ...upload, gymName: normalizedGym });
  } catch (error) {
    console.error("Could not save an upload.", error);
    return NextResponse.json(
      { error: "The file could not be saved. No success was reported. Please try again or check server storage." },
      { status: 500 },
    );
  }

  try {
    settings.events.unshift({
      at: new Date().toISOString(),
      type: "upload",
      message: `${existing ? "Replaced" : "Uploaded"} ${upload.rowsSaved} rows for the week starting ${upload.weekStartDate}.`,
    });
    settings.events = settings.events.slice(0, 200);
    await saveGymSettings(normalizedGym, settings);
  } catch (error) {
    console.error("The upload was saved, but its activity record could not be saved.", error);
    return NextResponse.json(
      { error: "Your spreadsheet data was saved, but its activity record could not be updated. Please refresh the page." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: `Saved ${upload.rowsSaved} row${upload.rowsSaved === 1 ? "" : "s"} for ${displayGymName}.`,
    rowsSaved: upload.rowsSaved,
    weekStartDate: upload.weekStartDate,
  });
}
