import { handleUploadRequest } from "@/lib/uploadHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  return handleUploadRequest(request);
}
