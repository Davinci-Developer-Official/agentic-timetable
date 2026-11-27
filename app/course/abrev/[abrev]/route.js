import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  const { store } = getRuntime();
  const { abrev } = await context.params;
  const matched = store.findMatchingCourses(decodeURIComponent(abrev));
  if (!matched.length) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  return NextResponse.json(matched);
}
