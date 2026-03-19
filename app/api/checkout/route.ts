import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LEMON_API_KEY = process.env.LEMON_SQUEEZY_API_KEY!;

type PlanId = "basic" | "team" | "pro" | "exclusive" | "pro_test";

const STORE_ID = "300112";

const PLAN_TO_VARIANT_ID: Record<PlanId, string> = {
  basic: "1358750",
  team: "1394223",
  pro: "1395047",
  exclusive: "1395048",
  pro_test: "1413318",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const plan = String(body?.plan || "") as PlanId;
    const email = normalizeEmail(body?.email);

    if (!plan || !PLAN_TO_VARIANT_ID[plan]) {
      return json({ ok: false, error: "invalid_plan" }, 400);
    }

    if (!email) {
      return json({ ok: false, error: "missing_email", message: "Unesi email." }, 400);
    }

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, owner_email, created_at")
      .ilike("owner_email", email)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (orgErr) {
      return json(
        {
          ok: false,
          error: "organization_lookup_failed",
          details: orgErr.message,
        },
        500
      );
    }

    if (org?.id) {
      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .select("status, valid_until, external_provider, external_subscription_id")
        .eq("org_id", org.id)
        .eq("external_provider", "lemonsqueezy")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (subErr) {
        return json(
          {
            ok: false,
            error: "subscription_lookup_failed",
            details: subErr.message,
          },
          500
        );
      }

      if (sub) {
        return json(
          {
            ok: false,
            error: "subscription_already_active",
            message:
              "Za ovaj email već postoji aktivna pretplata. Uloguj se u Owner Panel umesto nove kupovine.",
            redirect: "/app/auth",
          },
          409
        );
      }
    }

    const variantId = PLAN_TO_VARIANT_ID[plan];

    const lemonRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LEMON_API_KEY}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_options: {
  embed: false,
  media: false,
  logo: true,
  redirect_url: "https://app.vetasist.net/success",
},
            checkout_data: {
              email,
            },
            product_options: {
              redirect_url: "https://app.vetasist.net/app",
              receipt_button_text: "Otvori VetAssist",
              receipt_link_url: "https://app.vetasist.net/app",
            },
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: STORE_ID,
              },
            },
            variant: {
              data: {
                type: "variants",
                id: variantId,
              },
            },
          },
        },
      }),
      cache: "no-store",
    });

    const lemonData = await lemonRes.json().catch(() => null);

    if (!lemonRes.ok) {
      return json(
        {
          ok: false,
          error: "checkout_creation_failed",
          lemon_status: lemonRes.status,
          lemon_details: lemonData,
        },
        500
      );
    }

    const url = lemonData?.data?.attributes?.url;

    if (!url) {
      return json(
        {
          ok: false,
          error: "checkout_url_missing",
          lemon_details: lemonData,
        },
        500
      );
    }

    return json({
      ok: true,
      url,
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: "server_error",
        details: err instanceof Error ? err.message : "unknown",
      },
      500
    );
  }
}
