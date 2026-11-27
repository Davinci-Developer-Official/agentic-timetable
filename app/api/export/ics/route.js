import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { store } = getRuntime();
  const body = await request.json().catch(() => ({}));
  const { course, slots, title } = body || {};

  let targetSlots = Array.isArray(slots) ? slots : [];
  if (!targetSlots.length && course) {
    targetSlots = store.getCourseSlots(course, { allMatches: false });
  }
  if (!targetSlots.length) {
    return NextResponse.json({ error: "No classes provided to export" }, { status: 400 });
  }

  const ics = store.buildIcsCalendar(targetSlots, title || course || "Agentic Timetable");
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="timetable.ics"'
    }
  });
}
