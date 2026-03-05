import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Admin key (drži odvojeno od script key-a!)
function requireAdminKey(provided: string | undefined) {
  const adminKey = process.env.VETASIST_ADMIN_API_KEY;
  return adminKey && provided === adminKey;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { admin_key, license_key, device_fp, reset_all } = body;

    if (!requireAdminKey(admin_key)) {
      return NextResponse.json({ ok: false, error: "invalid_admin_key" }, { status: 401 });
    }

    if (!license_key) {
      return NextResponse.json({ ok: false, error: "missing_license_key" }, { status: 400 });
    }

    // ako reset_all = true -> briši sve uređaje za licencu
    if (reset_all === true) {
      const { error } = await supabase
        .from("license_devices")
        .delete()
        .eq("license_key", license_key);

      if (error) {
        return NextResponse.json({ ok: false, error: "delete_failed", detail: error }, { status: 500 });
      }

      return NextResponse.json({ ok: true, deleted: "all" });
    }

    // inače briši samo jedan uređaj
    if (!device_fp) {
      return NextResponse.json({ ok: false, error: "missing_device_fp" }, { status: 400 });
    }

    const { error } = await supabase
      .from("license_devices")
      .delete()
      .eq("license_key", license_key)
      .eq("device_fp", device_fp);

    if (error) {
      return NextResponse.json({ ok: false, error: "delete_failed", detail: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: device_fp });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
