import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = String(url.searchParams.get("org_id") || "").trim();

    if (!orgId) {
      return NextResponse.json(
        { ok: false, error: "missing_org_id" },
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

    const { data: devices, error: devicesErr } = await supabaseAdmin
      .from("license_devices")
      .select(
        "device_id, device_fp, status, first_seen, last_seen, blocked_until, reset_at, reset_reason"
      )
      .eq("license_key", licenseResult.license_key)
      .order("last_seen", { ascending: false });

    if (devicesErr) {
      return NextResponse.json(
        { ok: false, error: "devices_query_failed", details: devicesErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      devices: devices ?? [],
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
