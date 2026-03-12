import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
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
  const bodyText = await req.text();
  const signature = req.headers.get("x-signature") || "";

  if (!verifySignature(bodyText, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(bodyText);
  const event = body.meta?.event_name;

  if (event !== "subscription_created" && event !== "order_created") {
    return NextResponse.json({ ok: true });
  }

  const data = body.data?.attributes;

  const variant_id = data.variant_id;
  const email = data.user_email || data.customer_email || "unknown";
  const owner_name = data.user_name || email;

  const planInfo = PLAN_MAP[variant_id];

  if (!planInfo) {
    return NextResponse.json({ error: "Unknown variant" });
  }

  const { plan, device_limit } = planInfo;

  const license_key = generateLicenseKey();

  // 1️⃣ create organization (owner)
  const { data: org } = await supabase
    .from("organizations")
    .insert({
      name: owner_name,
      owner_email: email,
    })
    .select()
    .single();

  // 2️⃣ create subscription
  const { data: sub } = await supabase
    .from("subscriptions")
    .insert({
      organization_id: org.id,
      plan: plan,
      status: "active",
    })
    .select()
    .single();

  // 3️⃣ create license
  await supabase.from("license_keys").insert({
    license_key,
    organization_id: org.id,
    plan,
    device_limit,
  });

  return NextResponse.json({
    ok: true,
    license_key,
  });
}
