import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { getFloorPlan, getGymSettings, normalizeGymName, saveFloorPlan, saveGymSettings } from "@/lib/storage";
import { uploadLimitReached } from "@/lib/upload-limit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gymName = request.nextUrl.searchParams.get("gymName")?.trim();
  if (!gymName) return NextResponse.json({ error: "Enter your gym name." }, { status: 400 });
  try {
    const image = await getFloorPlan(normalizeGymName(gymName));
    if (!image) return NextResponse.json({ error: "No floor plan has been uploaded yet." }, { status: 404 });
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Could not read the floor plan.", error);
    return NextResponse.json({ error: "The floor plan could not be loaded. Please try again." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let gymName = "";
  let file: File | null = null;
  try {
    const form = await request.formData();
    gymName = String(form.get("gymName") ?? "").trim();
    const candidate = form.get("file");
    file = candidate instanceof File ? candidate : null;
  } catch {
    return NextResponse.json({ error: "Choose a PNG or JPG floor-plan image." }, { status: 400 });
  }
  if (!gymName || !file) {
    return NextResponse.json({ error: "Enter your gym name and choose a PNG or JPG floor-plan image." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "The image is larger than 10 MB. Choose a smaller image." }, { status: 400 });
  }

  let sanitized: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if (metadata.format !== "png" && metadata.format !== "jpeg") {
      return NextResponse.json({ error: "Choose a PNG or JPG image. Other image types are not accepted." }, { status: 400 });
    }
    sanitized = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .png()
      .toBuffer();
    if (sanitized.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "The cleaned image is larger than 10 MB. Choose a smaller image." }, { status: 400 });
    }
  } catch {
    return NextResponse.json(
      { error: "This image could not be read. Choose a valid PNG or JPG file and try again." },
      { status: 400 },
    );
  }

  try {
    const gym = normalizeGymName(gymName);
    const settings = await getGymSettings(gym);
    if (uploadLimitReached(settings.events)) {
      return NextResponse.json(
        { error: "This gym has reached 10 uploads in the last hour. Please wait and try again." },
        { status: 429 },
      );
    }
    await saveFloorPlan(gym, sanitized);
    settings.hasFloorPlan = true;
    settings.events.unshift({ at: new Date().toISOString(), type: "upload", message: "Uploaded a floor plan." });
    settings.events = settings.events.slice(0, 200);
    await saveGymSettings(gym, settings);
    return NextResponse.json({ message: "Your floor plan was saved." });
  } catch (error) {
    console.error("Could not save the floor plan.", error);
    return NextResponse.json(
      { error: "The floor plan could not be saved. Please try again or check the server storage." },
      { status: 500 },
    );
  }
}
