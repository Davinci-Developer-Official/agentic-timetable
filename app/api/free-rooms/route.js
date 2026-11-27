import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { store } = getRuntime();
  const { searchParams } = new URL(request.url);
  const availability = store.findFreeVenues({
    day: searchParams.get("day") || "",
    time: searchParams.get("time") || ""
  });
  return NextResponse.json({ count: availability.length, availability });
}
