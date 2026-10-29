import { NextResponse } from "next/server";
import { JobError, workerAction } from "@/app/lib/airs-jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > 512000) throw new JobError("payload_too_large", 413);
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new JobError("invalid_body");
    return NextResponse.json({ ok: true, ...await workerAction(body) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof JobError ? e.message : "worker_request_failed" }, { status: e instanceof JobError ? e.status : 400, headers: { "Cache-Control": "no-store" } });
  }
}
