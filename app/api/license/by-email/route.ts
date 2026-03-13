import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "disabled",
      details: "Public lookup by email is disabled for security reasons.",
    },
    { status: 410 }
  );
}
