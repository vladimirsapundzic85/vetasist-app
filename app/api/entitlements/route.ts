const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
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
    const body = await req.json();
    const license_key = body?.license_key;
    const device_id = body?.device_id;
    const device_fp = body?.device_fp;

    if (!license_key) {
      return NextResponse.json({ ok: false, error: "missing_license_key" }, { status: 400 });
    }
    if (!device_id) {
      return NextResponse.json({ ok: false, error: "missing_device_id" }, { status: 400 });
    }
    if (!device_fp) {
      return NextResponse.json({ ok: false, error: "missing_device_fp" }, { status: 400 });
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

    // fetch unique devices for this license (by device_fp)
    const { data: devices, error: devErr } = await supabase
      .from("license_devices")
      .select("device_fp")
      .eq("license_key", license_key);

    if (devErr) {
      return NextResponse.json({ ok: false, error: "device_lookup_failed" }, { status: 500 });
    }

    const known = new Set((devices ?? []).map(d => d.device_fp));
    const isNew = !known.has(device_fp);

    if (isNew && known.size >= limit) {
      return NextResponse.json(
        { ok: false, error: "device_limit_reached", limit },
        { status: 403 }
      );
    }

    // upsert heartbeat (PK = license_key + device_fp)
    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("license_devices")
      .upsert(
        {
          license_key,
          device_fp,
          device_id,
          last_seen: now,
        },
        { onConflict: "license_key,device_fp" }
      );

    if (upErr) {
      return NextResponse.json({ ok: false, error: "device_upsert_failed" }, { status: 500 });
    }

    // 4) get tools from DB function (already exists)
    const { data: tools, error: toolsErr } = await supabase.rpc("get_license_tools", {
      p_license_key: license_key,
    });

    if (toolsErr) {
      return NextResponse.json({ ok: false, error: "tools_lookup_failed" }, { status: 500 });
    }

    // 5) signed urls for each tool build path
    const out: Array<{ tool_code: string; version: string; url: string }> = [];

    for (const row of tools ?? []) {
      const tool_code = row.tool_code as string;
      const version = row.version as string;
      const storage_path = row.storage_path as string; // e.g. tools/vb_zbirni_xlsx/1.0.1/script.js

      const objectPath = storage_path.replace(/^tools\//i, ""); // bucket "Tools" expects path without leading "tools/"
      const { data: signed, error: signErr } = await supabase.storage
        .from("Tools")
        .createSignedUrl(objectPath, 60); // 60 seconds

      if (signErr || !signed?.signedUrl) {
        return NextResponse.json({ ok: false, error: "signed_url_failed", tool: tool_code }, { status: 500 });
      }

      out.push({ tool_code, version, url: signed.signedUrl });
    }

    return NextResponse.json({
      ok: true,
      plan_id: sub.plan_id,
      valid_until: sub.valid_until ?? null,
      device_limit: limit,
      device_new: isNew,
      tools: out,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
