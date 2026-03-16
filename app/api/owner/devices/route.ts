import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const org_id = url.searchParams.get("org_id");

    if (!org_id) {
      return NextResponse.json(
        { ok: false, error: "missing_org_id" },
        { status: 400 }
      );
    }

    // 1️⃣ Nađi licencu organizacije
    const { data: license, error: licenseError } = await supabase
      .from("license_keys")
      .select("license_key")
      .eq("org_id", org_id)
      .eq("status", "active")
      .single();

    if (licenseError || !license) {
      return NextResponse.json(
        { ok: false, error: "no_active_license" },
        { status: 404 }
      );
    }

    const license_key = license.license_key;

    // 2️⃣ Izvuci uređaje za tu licencu
    const { data: devices, error: devicesError } = await supabase
      .from("license_devices")
      .select(
        "device_id, device_fp, status, first_seen, last_seen, blocked_until, reset_at"
      )
      .eq("license_key", license_key)
      .order("last_seen", { ascending: false });

    if (devicesError) {
      return NextResponse.json(
        { ok: false, error: "devices_query_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      devices,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
