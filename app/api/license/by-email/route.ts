import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function deviceLimitForPlan(plan: string): number {
  if (plan === "basic") return 1;
  if (plan === "team") return 3;
  if (plan === "pro") return 10;
  if (plan === "exclusive") return 30;
  return 1;
}

export async function GET(req: NextRequest) {
  try {
    const email = String(req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "missing_email" },
        { status: 400 }
      );
    }

    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, owner_email, created_at")
      .ilike("owner_email", email)
      .order("created_at", { ascending: false })
      .limit(1);

    if (orgErr) {
      return NextResponse.json(
        { ok: false, error: "organization_lookup_failed", details: orgErr.message },
        { status: 500 }
      );
    }

    const org = orgs?.[0];

    if (!org) {
      return NextResponse.json(
        { ok: false, error: "license_not_found" },
        { status: 404 }
      );
    }

    const { data: licenses, error: licenseErr } = await supabase
      .from("license_keys")
      .select("license_key, org_id, is_active, created_at, plan")
      .eq("org_id", org.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (licenseErr) {
      return NextResponse.json(
        { ok: false, error: "license_lookup_failed", details: licenseErr.message },
        { status: 500 }
      );
    }

    const license = licenses?.[0];

    if (!license) {
      return NextResponse.json(
        { ok: false, error: "license_not_found" },
        { status: 404 }
      );
    }

    const { data: subs, error: subErr } = await supabase
      .from("subscriptions")
      .select("plan_id, status, valid_until, created_at")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (subErr) {
      return NextResponse.json(
        { ok: false, error: "subscription_lookup_failed", details: subErr.message },
        { status: 500 }
      );
    }

    const sub = subs?.[0] ?? null;
    const plan = String(sub?.plan_id || license.plan || "").trim();

    return NextResponse.json({
      ok: true,
      data: {
        owner_name: org.name,
        owner_email: org.owner_email,
        license_key: license.license_key,
        is_active: !!license.is_active,
        plan,
        valid_until: sub?.valid_until ?? null,
        subscription_status: sub?.status ?? null,
        device_limit: deviceLimitForPlan(plan),
      },
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
