import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LEMON_API_KEY = process.env.LEMON_SQUEEZY_API_KEY!;
const STORE_ID = 300112; // tvoj store_id (iz webhooka)

type PlanId = "basic" | "team" | "pro" | "exclusive" | "pro_test";

const PLAN_TO_VARIANT_ID: Record<PlanId, number> = {
  basic: 1358750,
  team: 1394223,
  pro: 1395047,
  exclusive: 1395048,
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const plan = body?.plan as PlanId;

    if (!plan || !PLAN_TO_VARIANT_ID[plan]) {
      return json({ ok: false, error: "invalid_plan" }, 400);
    }

    // TODO: zameni sa pravim auth kasnije
    const userEmail = "test2@vetassist.net";

    // 1. Nađi organizaciju po emailu
    const { data: org } = await supabase
      .from("organizations")
      .select("id, owner_email")
      .eq("owner_email", userEmail)
      .maybeSingle();

    if (!org) {
      return json({ ok: false, error: "organization_not_found" }, 404);
    }

    // 2. Proveri da li već ima aktivnu pretplatu
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, valid_until")
      .eq("org_id", org.id)
      .eq("external_provider", "lemonsqueezy")
      .maybeSingle();

    if (sub && sub.status === "active") {
      return json({
        ok: false,
        error: "subscription_already_active",
        message: "Već imaš aktivnu pretplatu.",
        redirect: "/app",
      });
    }

    // 3. Kreiraj checkout preko Lemon API
    const variantId = PLAN_TO_VARIANT_ID[plan];

    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LEMON_API_KEY}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            store_id: STORE_ID,
            variant_id: variantId,
            checkout_options: {
              embed: false,
              media: false,
              logo: true,
            },
            checkout_data: {
              email: userEmail,
            },
          },
        },
      }),
    });

    const data = await res.json();

    const url = data?.data?.attributes?.url;

    if (!url) {
      return json({
        ok: false,
        error: "checkout_creation_failed",
        details: data,
      }, 500);
    }

    return json({
      ok: true,
      url,
    });
  } catch (err) {
    return json({
      ok: false,
      error: "server_error",
      details: err instanceof Error ? err.message : "unknown",
    }, 500);
  }
}
