import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!;

function verifySignature(body: string, signature: string) {
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = hmac.update(body).digest("hex");
  return digest === signature;
}

function generateLicenseKey() {
  const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VTS-${part()}-${part()}-${part()}`;
}

const PLAN_MAP: Record<number, { plan: string; device_limit: number }> = {
  1358750: { plan: "basic", device_limit: 1 },
  1394223: { plan: "team", device_limit: 3 },
  1395047: { plan: "pro", device_limit: 10 },
  1395048: { plan: "exclusive", device_limit: 30 },
};

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-signature") || "";

    if (!WEBHOOK_SECRET) {
      return NextResponse.json(
        { ok: false, error: "missing_webhook_secret" },
        { status: 500 }
      );
    }

    if (!verifySignature(bodyText, signature)) {
      return NextResponse.json(
        { ok: false, error: "invalid_signature" },
        { status: 401 }
      );
    }

    const body = JSON.parse(bodyText);
    const event = body?.meta?.event_name;

    if (event !== "subscription_created" && event !== "order_created") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const data = body?.data?.attributes ?? {};

    const variant_id = Number(data.variant_id);
    const email =
      String(data.user_email || data.customer_email || "").trim() || "unknown";
    const owner_name =
      String(data.user_name || data.customer_name || "").trim() || email;

    const planInfo = PLAN_MAP[variant_id];

    if (!planInfo) {
      return NextResponse.json(
        { ok: false, error: "unknown_variant_id", variant_id },
        { status: 400 }
      );
    }

    const { plan } = planInfo;

    // 1) Napravi zapis "vlasnika licence" u organizations
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: owner_name,
      })
      .select("id, name")
      .single();

    if (orgErr || !org) {
      return NextResponse.json(
        {
          ok: false,
          error: "organization_insert_failed",
          details: orgErr?.message ?? null,
        },
        { status: 500 }
      );
    }

    // 2) Upiši subscription
    const { error: subErr } = await supabase.from("subscriptions").insert({
      org_id: org.id,
      plan_id: plan,
      status: "active",
      valid_until: null,
    });

    if (subErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "subscription_insert_failed",
          details: subErr.message ?? null,
        },
        { status: 500 }
      );
    }

    // 3) Generiši jedinstveni license key
    let license_key = "";
    let inserted = false;
    let attempts = 0;

    while (!inserted && attempts < 10) {
      attempts += 1;
      license_key = generateLicenseKey();

      const { error: licenseErr } = await supabase.from("license_keys").insert({
        license_key,
        org_id: org.id,
        is_active: true,
        plan,
      });

      if (!licenseErr) {
        inserted = true;
        break;
      }

      if (!String(licenseErr.message || "").toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          {
            ok: false,
            error: "license_insert_failed",
            details: licenseErr.message ?? null,
          },
          { status: 500 }
        );
      }
    }

    if (!inserted) {
      return NextResponse.json(
        { ok: false, error: "license_generation_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      event,
      plan,
      email,
      owner_name,
      license_key,
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
