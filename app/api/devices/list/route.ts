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

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("license_key")
      .eq("org_id", org_id)
      .eq("status", "active")
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { ok: false, error: "no_active_subscription" },
        { status: 404 }
      );
    }

    const license_key = subscription.license_key;

    const { data: devices, error } = await supabase
      .from("license_devices")
      .select("*")
      .eq("license_key", license_key)
      .order("last_seen", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "device_query_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      devices,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
