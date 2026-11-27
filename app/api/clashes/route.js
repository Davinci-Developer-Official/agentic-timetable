import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { store } = getRuntime();
  const body = await request.json().catch(() => ({}));
  const { items = [], mode = "" } = body || {};

  if (mode === "system" || !items.length) {
    return NextResponse.json(store.findSystemClashes());
  }
  return NextResponse.json(store.detectClashes(items));
}
