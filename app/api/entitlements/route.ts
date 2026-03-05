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

function deviceLimitForPlan(plan: string) {
  if (plan === "basic") return 1;
  if (plan === "team") return 3;
  if (plan === "pro") return 10;
  return 1;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const license_key = body?.license_key;
    const device_id = body?.device_id;
    const device_fp = body?.device_fp;

    if (!license_key) {
      return NextResponse.json(
        { ok: false, error: "missing_license_key" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!device_id) {
      return NextResponse.json(
        { ok: false, error: "missing_device_id" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!device_fp) {
      return NextResponse.json(
        { ok: false, error: "missing_device_fp" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 1️⃣ license lookup
    const { data: lk, error: lkErr } = await supabase
      .from("license_keys")
      .select("org_id, is_active")
      .eq("license_key", license_key)
      .single();

    if (lkErr || !lk) {
      return NextResponse.json(
        { ok: false, error: "license_key_not_found" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (!lk.is_active) {
      return NextResponse.json(
        { ok: false, error: "license_key_inactive" },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2️⃣ subscription lookup
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("status, plan_id, valid_until")
      .eq("org_id", lk.org_id)
      .single();

    if (subErr || !sub) {
      return NextResponse.json(
        { ok: false, error: "no_subscription" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (sub.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "inactive_license" },
        { status: 403, headers: corsHeaders }
      );
    }

    if (sub.valid_until && new Date(sub.valid_until) < new Date()) {
      return NextResponse.json(
        { ok: false, error: "expired" },
        { status: 403, headers: corsHeaders }
      );
    }

    // 3️⃣ device limit
    const limit = deviceLimitForPlan(sub.plan_id);

    const { data: devices, error: devErr } = await supabase
      .from("license_devices")
      .select("device_fp")
      .eq("license_key", license_key);

    if (devErr) {
      return NextResponse.json(
        { ok: false, error: "device_lookup_failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    const known = new Set((devices ?? []).map((d) => d.device_fp));
    const isNew = !known.has(device_fp);

    if (isNew && known.size >= limit) {
      return NextResponse.json(
        { ok: false, error: "device_limit_reached", limit },
        { status: 403, headers: corsHeaders }
      );
    }

    // 4️⃣ upsert device heartbeat
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
      return NextResponse.json(
        { ok: false, error: "device_upsert_failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    // 5️⃣ load tools
    const { data: tools, error: toolsErr } = await supabase.rpc(
      "get_license_tools",
      {
        p_license_key: license_key,
      }
    );

    if (toolsErr) {
      return NextResponse.json(
        { ok: false, error: "tools_lookup_failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    const out: Array<{ tool_code: string; version: string; url: string }> = [];

    for (const row of tools ?? []) {
      const tool_code = row.tool_code as string;
      const version = row.version as string;
      const storage_path = row.storage_path as string;

      const objectPath = storage_path.replace(/^tools\//i, "");

      const { data: signed, error: signErr } = await supabase.storage
        .from("Tools")
        .createSignedUrl(objectPath, 60);

      if (signErr || !signed?.signedUrl) {
        return NextResponse.json(
          { ok: false, error: "signed_url_failed", tool: tool_code },
          { status: 500, headers: corsHeaders }
        );
      }

      out.push({
        tool_code,
        version,
        url: signed.signedUrl,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        plan_id: sub.plan_id,
        valid_until: sub.valid_until ?? null,
        device_limit: limit,
        device_new: isNew,
        tools: out,
      },
      {
        headers: corsHeaders,
      }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
