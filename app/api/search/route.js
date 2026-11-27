import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { store } = getRuntime();
  const { searchParams } = new URL(request.url);
  const slots = store.searchSlots({
    q: searchParams.get("q") || "",
    course: searchParams.get("course") || "",
    day: searchParams.get("day") || "",
    time: searchParams.get("time") || "",
    lecturer: searchParams.get("lecturer") || "",
    unit: searchParams.get("unit") || "",
    venue: searchParams.get("venue") || "",
    mode: searchParams.get("mode") || ""
  });
  return NextResponse.json({ count: slots.length, slots });
}
