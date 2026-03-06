import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
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
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const { license_key, device_id } = await req.json();

    if (!license_key) {
      return jsonResponse({ ok: false, reason: "missing_license_key" }, 400);
    }

    if (!device_id) {
      return jsonResponse({ ok: false, reason: "missing_device_id" }, 400);
    }

    const device_fp = device_id;
    const now = new Date().toISOString();

    // 1) pronađi license key
    const { data: lk, error: lkErr } = await supabase
      .from("license_keys")
      .select("org_id, is_active, plan")
      .eq("license_key", license_key)
      .single();

    if (lkErr || !lk) {
      console.error("license lookup failed:", lkErr);
      return jsonResponse({ ok: false, reason: "license_key_not_found" }, 404);
    }

    if (!lk.is_active) {
      return jsonResponse({ ok: false, reason: "license_key_inactive" }, 403);
    }

    // 2) pretplata organizacije
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("status, plan_id, valid_until")
      .eq("org_id", lk.org_id)
      .single();

    if (subErr || !sub) {
      console.error("subscription lookup failed:", subErr);
      return jsonResponse({ ok: false, reason: "no_subscription" }, 404);
    }

    if (sub.status !== "active") {
      return jsonResponse({ ok: false, reason: "inactive_license" }, 403);
    }

    if (sub.valid_until && new Date(sub.valid_until) < new Date()) {
      return jsonResponse({ ok: false, reason: "expired" }, 403);
    }

    // 3) učitaj postojeće uređaje za tu licencu
    const { data: devices, error: devErr } = await supabase
      .from("license_devices")
      .select("license_key, device_id")
      .eq("license_key", license_key);

    if (devErr) {
      console.error("device lookup failed:", devErr);
      return jsonResponse({ ok: false, reason: "device_lookup_failed" }, 500);
    }

    const known = new Set((devices ?? []).map((d) => d.device_id));
    const isNew = !known.has(device_id);
    const limit = deviceLimitForPlan(sub.plan_id);

    if (isNew && known.size >= limit) {
      return jsonResponse(
        {
          ok: false,
          reason: "device_limit_reached",
          limit,
        },
        403
      );
    }

    // 4) update existing ili insert new
    if (isNew) {
      const { error: insertErr } = await supabase
        .from("license_devices")
        .insert({
          license_key,
          device_id,
          device_fp,
          first_seen: now,
          last_seen: now,
        });

      if (insertErr) {
        console.error("device insert failed:", insertErr);
        return jsonResponse(
          {
            ok: false,
            reason: "device_insert_failed",
            detail: insertErr.message ?? null,
            code: (insertErr as any).code ?? null,
            hint: (insertErr as any).hint ?? null,
          },
          500
        );
      }
    } else {
      const { error: updateErr } = await supabase
        .from("license_devices")
        .update({
          last_seen: now,
          device_fp,
        })
        .eq("license_key", license_key)
        .eq("device_id", device_id);

      if (updateErr) {
        console.error("device update failed:", updateErr);
        return jsonResponse(
          {
            ok: false,
            reason: "device_update_failed",
            detail: updateErr.message ?? null,
            code: (updateErr as any).code ?? null,
            hint: (updateErr as any).hint ?? null,
          },
          500
        );
      }
    }

    // 5) odgovor za ekstenziju
    return jsonResponse({
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
  } catch (error) {
    console.error("license validate fatal error:", error);
    return jsonResponse({ ok: false, reason: "server_error" }, 500);
  }
}
