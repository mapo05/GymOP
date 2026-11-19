import { NextRequest, NextResponse } from "next/server";
import { getGymSettings, normalizeGymName, saveGymSettings } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Enter a gym, equipment name, and a limit above 0." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const gymName = typeof input.gymName === "string" ? input.gymName.trim() : "";
  const equipmentName = typeof input.equipmentName === "string" ? input.equipmentName.trim() : "";
  const limit = input.limit;
  if (!gymName || !equipmentName || typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return NextResponse.json({ error: "Enter a gym, equipment name, and a limit above 0." }, { status: 400 });
  }

  try {
    const gym = normalizeGymName(gymName);
    const settings = await getGymSettings(gym);
    settings.limits[equipmentName.toLowerCase()] = limit;
    settings.events.unshift({
      at: new Date().toISOString(),
      type: "limit",
      message: `Changed the congestion limit for ${equipmentName} to ${limit}.`,
    });
    settings.events = settings.events.slice(0, 200);
    await saveGymSettings(gym, settings);
    return NextResponse.json({ message: `The limit for ${equipmentName} is now ${limit}.` });
  } catch (error) {
    console.error("Could not save a machine limit.", error);
    return NextResponse.json(
      { error: "The limit could not be saved. Please try again or check the server storage." },
      { status: 500 },
    );
  }
}
