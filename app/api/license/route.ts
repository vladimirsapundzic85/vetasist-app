import { NextResponse } from "next/server";
import {
  resolveLicenseContext,
  registerOrCheckDevice,
} from "@/app/lib/license-core";

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

    const context = await resolveLicenseContext(license_key);

    if (!context.ok) {
      const status =
        context.error === "license_key_not_found" || context.error === "no_subscription"
          ? 404
          : context.error === "server_error"
            ? 500
            : 403;

      return NextResponse.json(
        {
          ok: false,
          error: context.error,
          details: context.details ?? null,
        },
        { status }
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

      return NextResponse.json(
        {
          ok: false,
          error: deviceResult.error,
          details: deviceResult.details ?? null,
          limit: deviceResult.limit ?? null,
          device_count: deviceResult.deviceCount ?? null,
          blocked_until: deviceResult.blockedUntil ?? null,
          reset_limit: deviceResult.resetLimit ?? null,
          reset_count: deviceResult.resetCount ?? null,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      plan: context.subscription.plan_id,
      valid_until: context.subscription.valid_until ?? null,
      device_limit: deviceResult.limit,
      device_new: deviceResult.isNewDevice,
      device_count: deviceResult.deviceCount,
      legacy: true,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
