import { NextResponse } from "next/server";
import { getJob, JobError } from "@/app/lib/airs-jobs";
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

export async function GET(
  req: Request,
  context: { params: Promise<{ job_id: string }> }
) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const { job_id } = await context.params;
    const job = await getJob(job_id);
    return NextResponse.json(
      { ok: true, job },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
