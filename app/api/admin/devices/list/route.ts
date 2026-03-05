import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function requireAdminKey(provided: string | undefined) {
  const adminKey = process.env.VETASIST_ADMIN_API_KEY;
  return adminKey && provided === adminKey;
}

export async function POST(req: Request) {
  try {
    const { admin_key, license_key } = await req.json();

    if (!requireAdminKey(admin_key)) {
      return NextResponse.json({ ok: false, error: "invalid_admin_key" }, { status: 401 });
    }

    if (!license_key) {
      return NextResponse.json({ ok: false, error: "missing_license_key" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("license_devices")
      .select("device_fp, device_id, first_seen, last_seen")
      .eq("license_key", license_key)
      .order("last_seen", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: "list_failed", detail: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, devices: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
