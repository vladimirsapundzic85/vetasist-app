import { NextResponse } from "next/server";
import { createJob, JobError } from "@/app/lib/airs-jobs";
import { requireAdmin } from "@/app/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof JobError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

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
    return errorResponse(error);
  }
}
