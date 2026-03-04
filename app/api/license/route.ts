import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function deviceLimitForPlan(plan: string) {
  // MVP hardcode. Kasnije: čitati iz plans tabele.
  if (plan === "basic") return 1;
  if (plan === "team") return 3;
  if (plan === "pro") return 10;
  return 1;
}

export async function POST(req: Request) {
  try {
    const { license_key, api_key, device_id } = await req.json();

    if (api_key !== process.env.VETASIST_SCRIPT_API_KEY) {
      return NextResponse.json({ ok: false, error: "invalid_api_key" }, { status: 401 });
    }

    if (!license_key) {
      return NextResponse.json({ ok: false, error: "missing_license_key" }, { status: 400 });
    }

    if (!device_id) {
      return NextResponse.json({ ok: false, error: "missing_device_id" }, { status: 400 });
    }

    // 1) resolve org_id from license_key
    const { data: lk, error: lkErr } = await supabase
      .from("license_keys")
      .select("org_id, is_active")
      .eq("license_key", license_key)
      .single();

    if (lkErr || !lk) {
      return NextResponse.json({ ok: false, error: "license_key_not_found" }, { status: 404 });
    }

    if (!lk.is_active) {
      return NextResponse.json({ ok: false, error: "license_key_inactive" }, { status: 403 });
    }

    // 2) read subscription for org
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("status, plan_id, valid_until")
      .eq("org_id", lk.org_id)
      .single();

    if (subErr || !sub) {
      return NextResponse.json({ ok: false, error: "no_subscription" }, { status: 404 });
    }

    if (sub.status !== "active") {
      return NextResponse.json({ ok: false, error: "inactive_license" }, { status: 403 });
    }

    if (sub.valid_until && new Date(sub.valid_until) < new Date()) {
      return NextResponse.json({ ok: false, error: "expired" }, { status: 403 });
    }

    // 3) device registry + limit
    const limit = deviceLimitForPlan(sub.plan_id);

    // fetch unique devices for this license
    const { data: devices, error: devErr } = await supabase
      .from("license_devices")
      .select("device_id")
      .eq("license_key", license_key);

    if (devErr) {
      return NextResponse.json({ ok: false, error: "device_lookup_failed" }, { status: 500 });
    }

    const known = new Set((devices ?? []).map(d => d.device_id));
    const isNew = !known.has(device_id);

    if (isNew && known.size >= limit) {
      return NextResponse.json(
        { ok: false, error: "device_limit_reached", limit },
        { status: 403 }
      );
    }

    // upsert device heartbeat
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("license_devices")
      .upsert(
        { license_key, device_id, last_seen: now },
        { onConflict: "license_key,device_id" }
      );

    if (upErr) {
      return NextResponse.json({ ok: false, error: "device_upsert_failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      plan: sub.plan_id,
      valid_until: sub.valid_until ?? null,
      device_limit: limit,
      device_new: isNew,
      device_count: isNew ? known.size + 1 : known.size,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
