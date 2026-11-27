import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { store, isVercel } = getRuntime();
  return NextResponse.json({
    status: "ok",
    service: "agentic-timetable",
    framework: "nextjs",
    runtime: isVercel ? "vercel" : "node",
    coursesLoaded: store.courses.length,
    llmConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)
  });
}
