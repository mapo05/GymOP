import { NextRequest, NextResponse } from "next/server";
import { getGymSettings, normalizeGymName, saveGymSettings } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Choose a gym, machine, and position on the floor plan." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const gymName = typeof input.gymName === "string" ? input.gymName.trim() : "";
  const equipmentName = typeof input.equipmentName === "string" ? input.equipmentName.trim() : "";
  const x = input.x;
  const y = input.y;
  if (
    !gymName ||
    !equipmentName ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  ) {
    return NextResponse.json({ error: "Choose a position within the floor plan." }, { status: 400 });
  }

  try {
    const gym = normalizeGymName(gymName);
    const settings = await getGymSettings(gym);
    settings.placements[equipmentName.toLowerCase()] = { x, y };
    settings.events.unshift({
      at: new Date().toISOString(),
      type: "placement",
      message: `Placed ${equipmentName} on the floor plan.`,
    });
    settings.events = settings.events.slice(0, 200);
    await saveGymSettings(gym, settings);
    return NextResponse.json({ message: `${equipmentName} was placed on the floor plan.` });
  } catch (error) {
    console.error("Could not save a floor-plan position.", error);
    return NextResponse.json(
      { error: "The position could not be saved. Please try again or check the server storage." },
      { status: 500 },
    );
  }
}
