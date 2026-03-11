import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  resolveLicenseContext,
  registerOrCheckDevice,
  getToolByCode,
  getPlanToolAccess,
  getLatestToolBuild,
} from "@/app/lib/license-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const tool_code = String(body?.tool_code || body?.tool_slug || "").trim();

    if (!license_key) {
      return jsonResponse({ ok: false, error: "missing_license_key" }, 400);
    }

    if (!device_id) {
      return jsonResponse({ ok: false, error: "missing_device_id" }, 400);
    }

    if (!tool_code) {
      return jsonResponse({ ok: false, error: "missing_tool_code" }, 400);
    }

    const context = await resolveLicenseContext(license_key);

    if (!context.ok) {
      const status =
        context.error === "license_key_not_found" || context.error === "no_subscription"
          ? 404
          : context.error === "server_error"
            ? 500
            : 403;

      return jsonResponse(
        {
          ok: false,
          error: context.error,
          details: context.details ?? null,
        },
        status
      );
    }

    const deviceResult = await registerOrCheckDevice({
      license_key,
      device_id,
      device_fp: device_id,
    });

    if (!deviceResult.ok) {
      const status =
        deviceResult.error === "device_lookup_failed" ||
        deviceResult.error === "device_insert_failed" ||
        deviceResult.error === "device_update_failed" ||
        deviceResult.error === "current_key_device_lookup_failed" ||
        deviceResult.error === "server_error"
          ? 500
          : 403;

      return jsonResponse(
        {
          ok: false,
          error: deviceResult.error,
          details: deviceResult.details ?? null,
          limit: deviceResult.limit ?? null,
          device_count: deviceResult.deviceCount ?? null,
        },
        status
      );
    }

    const planId = String(context.subscription.plan_id || "").trim();

    const { data: tool, error: toolErr } = await getToolByCode(tool_code);

    if (toolErr || !tool) {
      return jsonResponse({ ok: false, error: "tool_not_found" }, 404);
    }

    if (!tool.is_active) {
      return jsonResponse({ ok: false, error: "tool_inactive" }, 403);
    }

    const { data: planTool, error: planToolErr } = await getPlanToolAccess(
      planId,
      tool.id
    );

    if (planToolErr || !planTool) {
      return jsonResponse({ ok: false, error: "tool_not_allowed_for_plan" }, 403);
    }

    if (!planTool.enabled) {
      return jsonResponse({ ok: false, error: "tool_disabled_for_plan" }, 403);
    }

    const { data: build, error: buildErr } = await getLatestToolBuild(tool.id);

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

    const { data: signed, error: signedErr } = await supabase.storage
      .from(TOOLS_BUCKET)
      .createSignedUrl(storagePath, 60);

    if (signedErr || !signed?.signedUrl) {
      return jsonResponse(
        {
          ok: false,
          error: "signed_url_failed",
          details: signedErr?.message || null,
          storage_path: storagePath,
        },
        500
      );
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
        payload_type: build.payload_type ?? "js",
      },
      script_url: signed.signedUrl,
      meta: {
        plan: planId,
        valid_until: context.subscription.valid_until ?? null,
        device_limit: deviceResult.limit,
        device_new: deviceResult.isNewDevice,
        device_count: deviceResult.deviceCount,
        storage_path: storagePath,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_server_error";

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
