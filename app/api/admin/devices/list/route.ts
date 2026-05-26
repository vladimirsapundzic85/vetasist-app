import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/app/lib/admin-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);

    if (!admin.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: admin.error,
        },
        { status: admin.status }
      );
    }

    const { license_key } = await req.json();

    if (!license_key) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_license_key",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("license_devices")
      .select("device_fp, device_id, first_seen, last_seen")
      .eq("license_key", license_key)
      .order("last_seen", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "list_failed",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      devices: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
