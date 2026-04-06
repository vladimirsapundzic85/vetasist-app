import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "deprecated_endpoint",
      message: "This endpoint is deprecated. Use /api/license/validate instead.",
    },
    { status: 410 }
  );
}
