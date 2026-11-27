import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { agent } = getRuntime();
    const body = await request.json().catch(() => ({}));
    const { message, sessionId } = body || {};
    const result = await agent.chat({ message, sessionId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json({ error: "Agent failed to process request" }, { status: 500 });
  }
}
