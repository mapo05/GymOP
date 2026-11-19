import { NextRequest, NextResponse } from "next/server";
import { calculateResults } from "@/lib/analytics";
import { getGymSettings, listWeeks, normalizeGymName } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gymName = request.nextUrl.searchParams.get("gymName")?.trim();
  if (!gymName) {
    return NextResponse.json({ error: "Enter your gym name to view results." }, { status: 400 });
  }

  try {
    const gym = normalizeGymName(gymName);
    const [uploads, settings] = await Promise.all([listWeeks(gym), getGymSettings(gym)]);
    const rows = uploads.flatMap((upload) => upload.rows);
    const weekCount = Number(request.nextUrl.searchParams.get("weekCount") ?? "1");
    const weekendView = request.nextUrl.searchParams.get("weekendView") === "separate"
      ? "separate"
      : "same";
    const today = new Date().toISOString().slice(0, 10);
    const results = calculateResults(rows, {
      weekendView,
      weekCount: Number.isFinite(weekCount) && weekCount > 0 ? weekCount : 1,
      limits: settings.limits,
      today,
    });

    return NextResponse.json(
      {
        results,
        limits: settings.limits,
        placements: settings.placements,
        hasFloorPlan: settings.hasFloorPlan,
        events: settings.events,
        weekStarts: uploads.map((upload) => upload.weekStartDate),
        weekCount,
        weekendView,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Could not load gym results.", error);
    return NextResponse.json(
      { error: "Results could not be loaded. Please try again or check the server storage." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
