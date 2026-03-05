import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getDeviceLimitFromPlans(plan_id: string): Promise<number> {
  // MVP: čitaj iz plans tabele ako postoji kolona device_limit
  const { data, error } = await supabase
    .from("plans")
    .select("device_limit")
    .eq("id", plan_id)
    .single();

  // fallback ako tabela/kolona nije spremna
  if (error || !data || data.device_limit == null) {
    if (plan_id === "basic") return 1;
    if (plan_id === "team") return 3;
    if (plan_id === "pro") return 10;
    return 1;
  }

  return Number(data.device_limit) || 1;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { license_key, api_key, device_id, device_fp } = body;

    // 0) API key
    if (api_key !== process.env.VETASIST_SCRIPT_API_KEY) {
      return NextResponse.json({ ok: false, error: "invalid_api_key" }, { status: 401 });
    }

    // 1) Input validation
    if (!license_key) {
      return NextResponse.json({ ok: false, error: "missing_license_key" }, { status: 400 });
    }
    if (!device_id) {
      return NextResponse.json({ ok: false, error: "missing_device_id" }, { status: 400 });
    }
    // NOVO: fingerprint mora da dođe od klijenta
    if (!device_fp) {
      return NextResponse.json({ ok: false, error: "missing_device_fp" }, { status: 400 });
    }

    // 2) resolve org_id from license_key
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

    // 3) read subscription for org
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

    // 4) device registry + limit (po device_fp)
    const limit = await getDeviceLimitFromPlans(sub.plan_id);

    const { data: devices, error: devErr } = await supabase
      .from("license_devices")
      .select("device_fp")
      .eq("license_key", license_key);

    if (devErr) {
      return NextResponse.json({ ok: false, error: "device_lookup_failed" }, { status: 500 });
    }

    const known = new Set((devices ?? []).map((d: any) => d.device_fp).filter(Boolean));
    const isNew = !known.has(device_fp);

    if (isNew && known.size >= limit) {
      return NextResponse.json(
        { ok: false, error: "device_limit_reached", limit },
        { status: 403 }
      );
    }

    // upsert device heartbeat (onConflict je license_key,device_fp)
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("license_devices")
      .upsert(
        { license_key, device_id, device_fp, first_seen: now, last_seen: now },
        { onConflict: "license_key,device_fp" }
      );

    if (upErr) {
      return NextResponse.json({ ok: false, error: "device_upsert_failed" }, { status: 500 });
    }

    // 5) entitlements iz DB funkcije
    const { data: tools, error: toolsErr } = await supabase
      .rpc("get_license_tools", { p_license_key: license_key });

    if (toolsErr) {
      return NextResponse.json({ ok: false, error: "entitlements_failed" }, { status: 500 });
    }

    // 6) signed URLs za svaki tool build
    const bucket = "Tools";
    const signed: any[] = [];

    for (const row of tools ?? []) {
      const storage_path = row.storage_path as string;

      // strip eventualni prefiks "tools/"
      const objectPath = storage_path.startsWith("tools/")
        ? storage_path.slice("tools/".length)
        : storage_path;

      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, 60);

      if (signErr || !signedData?.signedUrl) {
        return NextResponse.json(
          { ok: false, error: "signed_url_failed", tool: row.tool_code },
          { status: 500 }
        );
      }

      signed.push({
        tool_code: row.tool_code,
        version: row.version,
        url: signedData.signedUrl,
      });
    }

    return NextResponse.json({
      ok: true,
      plan_id: sub.plan_id,
      valid_until: sub.valid_until ?? null,
      device_limit: limit,
      device_new: isNew,
      tools: signed,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
