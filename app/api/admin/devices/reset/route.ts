import { NextResponse } from "next/server";
import {
  resetAllDevicesForLicense,
  resetDeviceForLicense,
  restoreResetBlockedDevice,
} from "@/app/lib/license-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const adminKey = String(body?.admin_key || "").trim();
    const licenseKey = String(body?.license_key || "").trim();
    const deviceFp = String(body?.device_fp || "").trim();
    const resetAll = !!body?.reset_all;
    const action = String(body?.action || (resetAll ? "reset_all" : "reset")).trim();
    const reason = body?.reason ? String(body.reason) : null;

    if (adminKey !== process.env.VETASIST_ADMIN_API_KEY) {
      return json({ ok: false, error: "invalid_admin_key" }, 401);
    }

    if (!licenseKey) {
      return json({ ok: false, error: "missing_license_key" }, 400);
    }

    if (action === "reset_all") {
      const result = await resetAllDevicesForLicense({
        license_key: licenseKey,
        performed_by: "admin",
        reason,
      });

      if (!result.ok) {
        const status = result.error === "server_error" ? 500 : 403;
        return json(
          {
            ok: false,
            error: result.error,
            details: result.details ?? null,
            reset_count: result.resetCount ?? null,
            reset_limit: result.resetLimit ?? null,
          },
          status
        );
      }

      return json({
        ok: true,
        action: result.action,
        affected: result.affected,
        reset_count: result.resetCount,
        reset_limit: result.resetLimit,
        blocked_until: result.blockedUntil,
      });
    }

    if (!deviceFp) {
      return json({ ok: false, error: "missing_device_fp" }, 400);
    }

    if (action === "restore") {
      const result = await restoreResetBlockedDevice({
        license_key: licenseKey,
        device_fp: deviceFp,
        performed_by: "admin",
        reason,
      });

      if (!result.ok) {
        const status =
          result.error === "server_error"
            ? 500
            : result.error === "device_not_found" || result.error === "device_not_reset_blocked"
              ? 404
              : 403;

        return json(
          {
            ok: false,
            error: result.error,
            details: result.details ?? null,
            reset_count: result.resetCount ?? null,
            reset_limit: result.resetLimit ?? null,
            blocked_until: result.blockedUntil ?? null,
          },
          status
        );
      }

      return json({
        ok: true,
        action: result.action,
        device_fp: result.deviceFp,
        device_id: result.deviceId,
        reset_count: result.resetCount,
        reset_limit: result.resetLimit,
      });
    }

    const result = await resetDeviceForLicense({
      license_key: licenseKey,
      device_fp: deviceFp,
      performed_by: "admin",
      reason,
    });

    if (!result.ok) {
      const status =
        result.error === "server_error"
          ? 500
          : result.error === "device_not_found"
            ? 404
            : 403;

      return json(
        {
          ok: false,
          error: result.error,
          details: result.details ?? null,
          reset_count: result.resetCount ?? null,
          reset_limit: result.resetLimit ?? null,
          blocked_until: result.blockedUntil ?? null,
        },
        status
      );
    }

    return json({
      ok: true,
      action: result.action,
      device_fp: result.deviceFp,
      device_id: result.deviceId,
      reset_count: result.resetCount,
      reset_limit: result.resetLimit,
      blocked_until: result.blockedUntil,
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: "server_error",
        details: err instanceof Error ? err.message : "unknown_server_error",
      },
      500
    );
  }
}
