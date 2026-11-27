import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  const { store } = getRuntime();
  const { course, day } = await context.params;
  const courseParam = decodeURIComponent(course);
  const dayParam = decodeURIComponent(day);

  const matched = store.findMatchingCourses(courseParam);
  if (!matched.length) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const slots = store.getCourseSlots(courseParam, { day: dayParam, allMatches: false });
  if (!slots.length) {
    return NextResponse.json({ message: `No classes on ${dayParam}` });
  }
  return NextResponse.json(slots);
}
