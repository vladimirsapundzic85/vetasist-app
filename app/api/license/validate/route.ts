import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(),
  });
}

function deviceLimitForPlan(plan: string) {
  if (plan === "basic") return 1;
  if (plan === "team") return 3;
  if (plan === "pro") return 10;
  return 1;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(req: Request) {
  try {
    const { license_key, device_id } = await req.json();

    if (!license_key) {
      return json({ ok: false, reason: "missing_license_key" }, 400);
    }

    if (!device_id) {
      return json({ ok: false, reason: "missing_device_id" }, 400);
    }

    const { data: lk, error: lkErr } = await supabase
      .from("license_keys")
      .select("org_id, is_active, plan")
      .eq("license_key", license_key)
      .single();

    if (lkErr || !lk) {
      return json({ ok: false, reason: "license_key_not_found" }, 404);
    }

    if (!lk.is_active) {
      return json({ ok: false, reason: "license_key_inactive" }, 403);
    }

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("status, plan_id, valid_until")
      .eq("org_id", lk.org_id)
      .single();

    if (subErr || !sub) {
      return json({ ok: false, reason: "no_subscription" }, 404);
    }

    if (sub.status !== "active") {
      return json({ ok: false, reason: "inactive_license" }, 403);
    }

    if (sub.valid_until && new Date(sub.valid_until) < new Date()) {
      return json({ ok: false, reason: "expired" }, 403);
    }

    const limit = deviceLimitForPlan(sub.plan_id);

    const { data: devices, error: devErr } = await supabase
      .from("license_devices")
      .select("device_id")
      .eq("license_key", license_key);

    if (devErr) {
      return json({ ok: false, reason: "device_lookup_failed" }, 500);
    }

    const known = new Set((devices ?? []).map((d) => d.device_id));
    const isNew = !known.has(device_id);

    if (isNew && known.size >= limit) {
      return json(
        {
          ok: false,
          reason: "device_limit_reached",
          limit,
        },
        403
      );
    }

    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("license_devices")
      .upsert(
        {
          license_key,
          device_id,
          device_fp: device_id,
          last_seen: now,
        },
        { onConflict: "license_key,device_id" }
      );

    if (upErr) {
      return json({ ok: false, reason: "device_upsert_failed" }, 500);
    }

    return json({
      ok: true,
      reason: "OK",
      plan: sub.plan_id,
      valid_until: sub.valid_until ?? null,
      device_limit: limit,
      device_new: isNew,
      device_count: isNew ? known.size + 1 : known.size,
      tools: [
        {
          code: "vb_zbirni_xlsx",
          version: "1.0.1",
        },
      ],
    });
  } catch {
    return json({ ok: false, reason: "server_error" }, 500);
  }
}
