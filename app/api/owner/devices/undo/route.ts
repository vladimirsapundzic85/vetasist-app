import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { restoreResetBlockedDevice } from "@/app/lib/license-core";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { org_id, device_fp } = body;

    if (!org_id || !device_fp) {
      return NextResponse.json(
        { ok: false, error: "missing_parameters" },
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

    // 2️⃣ Undo reset (samo ako je u 10 minuta)
    const result = await restoreResetBlockedDevice({
      license_key,
      device_fp,
      reason: "owner_restore",
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          details: result.details ?? null,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
  ok: true,
  action: result.action,
  device_fp: result.deviceFp,
  device_id: result.deviceId,
  reset_count: result.resetCount,
  reset_limit: result.resetLimit,
  blocked_until: result.blockedUntil,
});
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
