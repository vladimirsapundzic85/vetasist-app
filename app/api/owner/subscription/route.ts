import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LEMON_API_KEY = process.env.LEMON_SQUEEZY_API_KEY!;

type PlanId = "basic" | "team" | "pro" | "exclusive";

const PLAN_TO_VARIANT_ID: Record<PlanId, number> = {
  basic: 1358750,
  team: 1394223,
  pro: 1395047,
  exclusive: 1395048,
};

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

async function requireOwnerContext(req: Request) {
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
    .limit(1)
    .maybeSingle();

  if (membershipErr) {
    return { ok: false as const, status: 500, error: "membership_lookup_failed" };
  }

  if (!membership?.org_id) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  const { data: subscription, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "org_id, plan_id, status, valid_until, external_subscription_id, external_provider, external_variant_id, external_customer_id, provider_status, cancel_at_period_end"
    )
    .eq("org_id", membership.org_id)
    .eq("external_provider", "lemonsqueezy")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr) {
    return { ok: false as const, status: 500, error: "subscription_lookup_failed" };
  }

  if (!subscription?.external_subscription_id) {
    return { ok: false as const, status: 404, error: "no_lemonsqueezy_subscription" };
  }

  return {
    ok: true as const,
    user,
    org_id: String(membership.org_id),
    subscription,
  };
}

async function lemonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.lemonsqueezy.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${LEMON_API_KEY}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { res, data };
}

function mapPlanToVariantId(planId: string): number | null {
  const normalized = String(planId || "").trim().toLowerCase() as PlanId;
  return PLAN_TO_VARIANT_ID[normalized] ?? null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerContext(req);

    if (!ctx.ok) {
      return json({ ok: false, error: ctx.error }, ctx.status);
    }

    const subscriptionId = String(ctx.subscription.external_subscription_id);

    const { res, data } = await lemonFetch(`/v1/subscriptions/${subscriptionId}`);

    if (!res.ok) {
      return json(
        {
          ok: false,
          error: "lemonsqueezy_fetch_failed",
          details: data,
        },
        502
      );
    }

    const attrs = data?.data?.attributes ?? {};
    const urls = attrs?.urls ?? {};

    return json({
      ok: true,
      subscription: {
        org_id: ctx.org_id,
        external_subscription_id: subscriptionId,
        plan_id: ctx.subscription.plan_id,
        status: attrs?.status ?? ctx.subscription.status,
        provider_status: attrs?.status ?? ctx.subscription.provider_status ?? null,
        valid_until: attrs?.renews_at ?? attrs?.ends_at ?? ctx.subscription.valid_until ?? null,
        cancel_at_period_end:
          typeof attrs?.cancelled === "boolean"
            ? attrs.cancelled
            : !!ctx.subscription.cancel_at_period_end,
      },
      links: {
        customer_portal: urls?.customer_portal ?? null,
        update_payment_method: urls?.update_payment_method ?? null,
        update_customer_portal: urls?.customer_portal_update_subscription ?? null,
      },
      available_plans: [
        { id: "basic", label: "Basic" },
        { id: "team", label: "Team" },
        { id: "pro", label: "Pro" },
        { id: "exclusive", label: "Exclusive" },
      ],
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

export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerContext(req);

    if (!ctx.ok) {
      return json({ ok: false, error: ctx.error }, ctx.status);
    }

    const body = await req.json().catch(() => null);
    const action = String(body?.action || "").trim();
    const subscriptionId = String(ctx.subscription.external_subscription_id);

    if (!action) {
      return json({ ok: false, error: "missing_action" }, 400);
    }

    if (action === "cancel") {
      const { res, data } = await lemonFetch(`/v1/subscriptions/${subscriptionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        return json(
          {
            ok: false,
            error: "lemonsqueezy_cancel_failed",
            details: data,
          },
          502
        );
      }

      return json({
        ok: true,
        action: "cancel",
        message: "Pretplata je otkazana i važi do kraja plaćenog perioda.",
        lemonsqueezy: data,
      });
    }

    if (action === "resume") {
      const payload = {
        data: {
          type: "subscriptions",
          id: subscriptionId,
          attributes: {
            cancelled: false,
          },
        },
      };

      const { res, data } = await lemonFetch(`/v1/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return json(
          {
            ok: false,
            error: "lemonsqueezy_resume_failed",
            details: data,
          },
          502
        );
      }

      return json({
        ok: true,
        action: "resume",
        message: "Pretplata je ponovo aktivirana.",
        lemonsqueezy: data,
      });
    }

    if (action === "change_plan") {
      const newPlanId = String(body?.plan_id || "").trim().toLowerCase();

      if (!newPlanId) {
        return json({ ok: false, error: "missing_plan_id" }, 400);
      }

      if (newPlanId === String(ctx.subscription.plan_id || "").trim().toLowerCase()) {
        return json({ ok: false, error: "same_plan" }, 400);
      }

      const variantId = mapPlanToVariantId(newPlanId);

      if (!variantId) {
        return json({ ok: false, error: "unknown_plan_id" }, 400);
      }

      const payload = {
        data: {
          type: "subscriptions",
          id: subscriptionId,
          attributes: {
            variant_id: variantId,
          },
        },
      };

      const { res, data } = await lemonFetch(`/v1/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return json(
          {
            ok: false,
            error: "lemonsqueezy_change_plan_failed",
            details: data,
          },
          502
        );
      }

      return json({
        ok: true,
        action: "change_plan",
        message: "Promena plana je poslata Lemon Squeezy-ju.",
        lemonsqueezy: data,
      });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
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
