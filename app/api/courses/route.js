import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { store } = getRuntime();
  const { searchParams } = new URL(request.url);
  const courses = store.listCourses({
    query: searchParams.get("q") || "",
    program: searchParams.get("program") || "",
    year: searchParams.get("year") || "",
    semester: searchParams.get("semester") || ""
  });
  return NextResponse.json(courses);
}
