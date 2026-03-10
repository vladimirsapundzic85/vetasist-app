import { NextResponse } from "next/server";
import {
  resolveLicenseContext,
  registerOrCheckDevice,
  getAvailableToolsForPlan,
} from "@/app/lib/license-core";

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
          reason: context.error,
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
          reason: deviceResult.error,
          details: deviceResult.details ?? null,
          limit: deviceResult.limit ?? null,
          device_count: deviceResult.deviceCount ?? null,
        },
        status
      );
    }

    const tools = await getAvailableToolsForPlan(context.subscription.plan_id);

    return jsonResponse({
      ok: true,
      reason: "OK",
      plan: context.subscription.plan_id,
      valid_until: context.subscription.valid_until ?? null,
      device_limit: deviceResult.limit,
      device_new: deviceResult.isNewDevice,
      device_count: deviceResult.deviceCount,
      tools,
    });
  } catch (error) {
    console.error("license validate fatal error:", error);
    return jsonResponse({ ok: false, reason: "server_error" }, 500);
  }
}
