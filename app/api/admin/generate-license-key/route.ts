import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function makeKey() {
  // jednostavan, ali dovoljno dobar za MVP
  // format: VTS-XXXX-XXXX-XXXX
  const chunk = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VTS-${chunk()}-${chunk()}-${chunk()}`;
}

export async function POST(req: Request) {
  try {
    const { api_key, org_id } = await req.json();

    if (api_key !== process.env.VETASIST_SCRIPT_API_KEY) {
      return NextResponse.json({ ok: false, error: "invalid_api_key" }, { status: 401 });
    }

    if (!org_id) {
      return NextResponse.json({ ok: false, error: "missing_org_id" }, { status: 400 });
    }

    // pokušaj nekoliko puta zbog rare collision
    for (let i = 0; i < 5; i++) {
      const license_key = makeKey();

      const { data, error } = await supabase
        .from("license_keys")
        .insert({ license_key, org_id })
        .select("license_key, org_id, is_active, created_at")
        .single();

      if (!error && data) {
        return NextResponse.json({ ok: true, license: data });
      }

      // ako je collision na primary key, probaj opet
      const msg = (error?.message || "").toLowerCase();
      const isCollision = msg.includes("duplicate") || msg.includes("unique") || msg.includes("primary");
      if (!isCollision) {
        return NextResponse.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: false, error: "could_not_generate_unique_key" }, { status: 500 });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
