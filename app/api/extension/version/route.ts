import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    latest_extension_version: "0.1.2",
    minimum_extension_version: "0.1.1",
    update_url: "https://vetasist.carrd.co/",
    message: "Dostupna je nova verzija ekstenzije."
  });
}
