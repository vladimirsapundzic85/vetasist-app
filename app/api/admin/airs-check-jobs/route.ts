import { NextResponse } from "next/server";
import { createJob, JobError } from "@/app/lib/airs-jobs";
import { requireAdmin } from "@/app/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const text = await req.text();
    if (Buffer.byteLength(text) > 16000) {
      throw new JobError("payload_too_large", 413);
    }

    const job = await createJob(JSON.parse(text));
    return NextResponse.json(
      { ok: true, job },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error instanceof JobError ? error.status : 400;
    const message = error instanceof JobError ? error.message : "invalid_request";
    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
