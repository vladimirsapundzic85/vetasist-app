import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resetDeviceForLicense } from "@/app/lib/license-core";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getAuthClient(req: Request) {
  const authHeader = req.headers.get("authorization") || "";

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
}

async function resolveOwnerLicenseKey(req: Request, orgId: string) {
  const authClient = getAuthClient(req);

  const {
    data: { user },
    error: userErr,
  } = await authClient.auth.getUser();

  if (userErr || !user) {
    return { ok: false as const, status: 401, error: "unauthorized" };
  }

  const { data: membership, error: membershipErr } = await supabaseAdmin
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (membershipErr) {
    return { ok: false as const, status: 500, error: "membership_lookup_failed" };
  }

  if (!membership) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const { data: license, error: licenseErr } = await supabaseAdmin
    .from("license_keys")
    .select("license_key")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (licenseErr) {
    return { ok: false as const, status: 500, error: "license_lookup_failed" };
  }

  if (!license?.license_key) {
    return { ok: false as const, status: 404, error: "no_active_license" };
  }

  return {
    ok: true as const,
    license_key: String(license.license_key),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const orgId = String(body?.org_id || "").trim();
    const deviceFp = String(body?.device_fp || "").trim();

    if (!orgId || !deviceFp) {
      return NextResponse.json(
        { ok: false, error: "missing_parameters" },
        { status: 400 }
      );
    }

    const licenseResult = await resolveOwnerLicenseKey(req, orgId);

    if (!licenseResult.ok) {
      return NextResponse.json(
        { ok: false, error: licenseResult.error },
        { status: licenseResult.status }
      );
    }

    const result = await resetDeviceForLicense({
      license_key: licenseResult.license_key,
      device_fp: deviceFp,
      performed_by: "owner",
      reason: "owner_reset",
    });

    if (!result.ok) {
      const status =
        result.error === "device_not_found"
          ? 404
          : result.error === "server_error"
          ? 500
          : 403;

      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          details: result.details ?? null,
          reset_count: result.resetCount ?? null,
          reset_limit: result.resetLimit ?? null,
          blocked_until: result.blockedUntil ?? null,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      action: result.action,
      device_fp: result.deviceFp,
      device_id: result.deviceId,
      reset_count: result.resetCount,
      reset_limit: result.resetLimit,
      blocked_until: result.blockedUntil,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        details: err instanceof Error ? err.message : "unknown_server_error",
      },
      { status: 500 }
    );
  }
}
