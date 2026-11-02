import { NextResponse } from "next/server";
import { getJob, JobError } from "@/app/lib/airs-jobs";
import { requireAdmin } from "@/app/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const status = error instanceof JobError ? error.status : 400;
    const message = error instanceof JobError ? error.message : "invalid_request";
    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
