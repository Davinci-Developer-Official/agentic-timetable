import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  const { store } = getRuntime();
  const { course } = await context.params;
  const courseParam = decodeURIComponent(course);
  const slots = store.getCourseSlots(courseParam, { allMatches: false });
  if (!slots.length) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  return NextResponse.json(slots);
}
