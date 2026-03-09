import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOOLS_BUCKET = "Tools";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function deviceLimitForPlan(plan: string) {
  if (plan === "basic") return 1;
  if (plan === "team") return 3;
  if (plan === "pro") return 10;
  if (plan === "exclusive") return 30;
  return 1;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const license_key = String(body?.license_key || "").trim();
    const device_id = String(body?.device_id || "").trim();
    const tool_code = String(body?.tool_code || "").trim();
    const api_key = String(body?.api_key || "").trim();

    if (api_key !== process.env.VETASIST_SCRIPT_API_KEY) {
      return jsonResponse({ ok: false, error: "invalid_api_key" }, 401);
    }

    if (!license_key) {
      return jsonResponse({ ok: false, error: "missing_license_key" }, 400);
    }

    if (!device_id) {
      return jsonResponse({ ok: false, error: "missing_device_id" }, 400);
    }

    if (!tool_code) {
      return jsonResponse({ ok: false, error: "missing_tool_code" }, 400);
    }

    const { data: lk, error: lkErr } = await supabase
      .from("license_keys")
      .select("org_id, is_active")
      .eq("license_key", license_key)
      .single();

    if (lkErr || !lk) {
      return jsonResponse({ ok: false, error: "license_key_not_found" }, 404);
    }

    if (!lk.is_active) {
      return jsonResponse({ ok: false, error: "license_key_inactive" }, 403);
    }

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("status, plan_id, valid_until")
      .eq("org_id", lk.org_id)
      .single();

    if (subErr || !sub) {
      return jsonResponse({ ok: false, error: "no_subscription" }, 404);
    }

    if (sub.status !== "active") {
      return jsonResponse({ ok: false, error: "inactive_license" }, 403);
    }

    if (sub.valid_until && new Date(sub.valid_until) < new Date()) {
      return jsonResponse({ ok: false, error: "expired" }, 403);
    }

    const planId = String(sub.plan_id || "").trim();
    const deviceLimit = deviceLimitForPlan(planId);

    const { data: devices, error: devLookupErr } = await supabase
      .from("license_devices")
      .select("device_id")
      .eq("license_key", license_key);

    if (devLookupErr) {
      return jsonResponse({ ok: false, error: "device_lookup_failed" }, 500);
    }

    const known = new Set((devices ?? []).map((d) => String(d.device_id)));
    const isNewDevice = !known.has(device_id);

    if (isNewDevice && known.size >= deviceLimit) {
      return jsonResponse(
        {
          ok: false,
          error: "device_limit_reached",
          limit: deviceLimit,
          device_count: known.size,
        },
        403
      );
    }

    const now = new Date().toISOString();

    const { data: existingDevice, error: existingDeviceErr } = await supabase
      .from("license_devices")
      .select("license_key, device_id")
      .eq("license_key", license_key)
      .eq("device_id", device_id)
      .maybeSingle();

    if (existingDeviceErr) {
      return jsonResponse(
        {
          ok: false,
          error: "current_key_device_lookup_failed",
          details: existingDeviceErr.message,
        },
        500
      );
    }

    if (!existingDevice) {
      const { error: insertErr } = await supabase
        .from("license_devices")
        .insert({
          license_key,
          device_id,
          device_fp: device_id,
          first_seen: now,
          last_seen: now,
        });

      if (insertErr) {
        return jsonResponse(
          {
            ok: false,
            error: "device_insert_failed",
            details: insertErr.message,
          },
          500
        );
      }
    } else {
      const { error: upErr } = await supabase
        .from("license_devices")
        .update({
          device_fp: device_id,
          last_seen: now,
        })
        .eq("license_key", license_key)
        .eq("device_id", device_id);

      if (upErr) {
        return jsonResponse(
          {
            ok: false,
            error: "device_update_failed",
            details: upErr.message,
          },
          500
        );
      }
    }

    const { data: tool, error: toolErr } = await supabase
      .from("tools")
      .select("id, code, name, description, species, is_active")
      .eq("code", tool_code)
      .single();

    if (toolErr || !tool) {
      return jsonResponse({ ok: false, error: "tool_not_found" }, 404);
    }

    if (!tool.is_active) {
      return jsonResponse({ ok: false, error: "tool_inactive" }, 403);
    }

    const { data: planTool, error: planToolErr } = await supabase
      .from("plan_tools")
      .select("enabled")
      .eq("plan_id", planId)
      .eq("tool_id", tool.id)
      .single();

    if (planToolErr || !planTool) {
      return jsonResponse({ ok: false, error: "tool_not_allowed_for_plan" }, 403);
    }

    if (!planTool.enabled) {
      return jsonResponse({ ok: false, error: "tool_disabled_for_plan" }, 403);
    }

    const { data: build, error: buildErr } = await supabase
      .from("tool_builds")
      .select("version, storage_path, is_active, is_latest, sha256")
      .eq("tool_id", tool.id)
      .eq("is_latest", true)
      .single();

    if (buildErr || !build) {
      return jsonResponse({ ok: false, error: "tool_build_not_found" }, 404);
    }

    if (!build.is_active) {
      return jsonResponse({ ok: false, error: "tool_build_inactive" }, 403);
    }

    const storagePath = String(build.storage_path || "").trim();
    if (!storagePath) {
      return jsonResponse({ ok: false, error: "empty_storage_path" }, 500);
    }

    const { data: fileData, error: downloadErr } = await supabase.storage
      .from(TOOLS_BUCKET)
      .download(storagePath);

    if (downloadErr || !fileData) {
      return jsonResponse(
        {
          ok: false,
          error: "tool_download_failed",
          details: downloadErr?.message || null,
          storage_path: storagePath,
        },
        500
      );
    }

    const script = await fileData.text();

    if (!script || !script.trim()) {
      return jsonResponse({ ok: false, error: "empty_tool_script" }, 500);
    }

    return jsonResponse({
      ok: true,
      tool: {
        code: tool.code,
        name: tool.name,
        description: tool.description,
        species: tool.species,
        version: build.version,
        sha256: build.sha256 ?? null,
      },
      script,
      meta: {
        plan: planId,
        device_limit: deviceLimit,
        device_new: isNewDevice,
        device_count: isNewDevice ? known.size + 1 : known.size,
        storage_path: storagePath,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "unknown_server_error";

    return jsonResponse(
      {
        ok: false,
        error: "server_error",
        details: message,
      },
      500
    );
  }
}
