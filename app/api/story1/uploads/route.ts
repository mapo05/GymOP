import { NextRequest, NextResponse } from "next/server";
import { listWeeks, normalizeGymName } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gymName = request.nextUrl.searchParams.get("gymName")?.trim();
  if (!gymName) return NextResponse.json([]);
  try {
    const uploads = await listWeeks(normalizeGymName(gymName));
    return NextResponse.json(
      uploads.map((upload) => ({
        gymName: upload.gymName,
        weekStartDate: upload.weekStartDate,
        rowsSaved: upload.rows.length,
        uploadedAt: upload.uploadedAt,
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Could not load saved upload weeks.", error);
    return NextResponse.json(
      { error: "Saved weeks could not be loaded. Please try again or check server storage." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
