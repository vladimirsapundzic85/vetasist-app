import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LEMON_API_KEY_LIVE = process.env.LEMON_API_KEY_LIVE!;
const LEMON_API_KEY_TEST = process.env.LEMON_API_KEY_TEST!;

type PlanId = "basic" | "team" | "pro" | "exclusive";

const PLAN_ORDER: Record<PlanId, number> = {
  basic: 1,
  team: 2,
  pro: 3,
  exclusive: 4,
};

const PLAN_TO_VARIANT_ID_LIVE: Record<PlanId, number> = {
  basic: 1358750,
  team: 1394223,
  pro: 1395047,
  exclusive: 1395048,
};

const PLAN_TO_VARIANT_ID_TEST: Record<PlanId, number> = {
  basic: 1395337,
  team: 1413312,
  pro: 1413318,
  exclusive: 1689126,
};
const TEST_VARIANT_IDS = Object.values(PLAN_TO_VARIANT_ID_TEST);

function resolveLemonApiKey(isTestMode: boolean): string {
  return isTestMode
    ? LEMON_API_KEY_TEST
    : LEMON_API_KEY_LIVE;
}

function isTestVariant(variantId: unknown): boolean {
  const num = Number(variantId || 0);
  return TEST_VARIANT_IDS.includes(num);
}

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

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function safeString(value: unknown): string {
  return String(value || "").trim();
}

function normalizePlanId(value: unknown): PlanId | null {
  const plan = String(value || "").trim().toLowerCase();

  if (plan === "basic") return "basic";
  if (plan === "team") return "team";
  if (plan === "pro") return "pro";
  if (plan === "exclusive") return "exclusive";

  return null;
}

function mapPlanToVariantId(planId: PlanId, isTestMode: boolean): number {
  return isTestMode
    ? PLAN_TO_VARIANT_ID_TEST[planId]
    : PLAN_TO_VARIANT_ID_LIVE[planId];
}

function extractLemonErrorDetails(data: any): string {
  if (!data) return "unknown_lemonsqueezy_error";
  if (typeof data === "string") return data;

  const firstDetail = data?.errors?.[0]?.detail;
  if (firstDetail) return String(firstDetail);

  const firstTitle = data?.errors?.[0]?.title;
  if (firstTitle) return String(firstTitle);

  if (data?.message) return String(data.message);

  return JSON.stringify(data);
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

  const { data: memberships, error: membershipErr } = await supabaseAdmin
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .order("created_at", { ascending: true });

  if (membershipErr) {
    return { ok: false as const, status: 500, error: "membership_lookup_failed" };
  }

  if (!memberships || memberships.length === 0) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  if (memberships.length > 1) {
    return { ok: false as const, status: 409, error: "multiple_owner_orgs_detected" };
  }

  const ownerOrgId = String(memberships[0].org_id);

  const { data: subscriptions, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      `
      org_id,
      plan_id,
      status,
      valid_until,
      external_subscription_id,
      external_provider,
      external_variant_id,
      external_customer_id,
      provider_status,
      cancel_at_period_end,
      scheduled_plan_id,
      scheduled_plan_change_at,
      updated_at
    `
    )
    .eq("org_id", ownerOrgId)
    .eq("external_provider", "lemonsqueezy")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (subErr) {
    return { ok: false as const, status: 500, error: "subscription_lookup_failed" };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { ok: false as const, status: 404, error: "no_lemonsqueezy_subscription" };
  }

  const canonicalSubscription =
    subscriptions.find(
      (s) => String(s.provider_status || "").toLowerCase() !== "expired"
    ) || subscriptions[0];

  if (!canonicalSubscription?.external_subscription_id) {
    return { ok: false as const, status: 404, error: "no_lemonsqueezy_subscription" };
  }

  return {
    ok: true as const,
    user,
    org_id: ownerOrgId,
    subscription: canonicalSubscription,
  };
}

async function lemonFetch(
  path: string,
  apiKey: string,
  init?: RequestInit
) {
  const res = await fetch(`https://api.lemonsqueezy.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
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

export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerContext(req);

    if (!ctx.ok) {
      return json({ ok: false, error: ctx.error }, ctx.status);
    }

    const subscriptionId = String(ctx.subscription.external_subscription_id);

const lemonApiKey = resolveLemonApiKey(
  isTestVariant(ctx.subscription.external_variant_id)
);

const { res, data } = await lemonFetch(
  `/v1/subscriptions/${subscriptionId}`,
  lemonApiKey
);

    if (!res.ok) {
      return json(
        {
          ok: false,
          error: "lemonsqueezy_fetch_failed",
          details: extractLemonErrorDetails(data),
          raw: data,
        },
        502
      );
    }

    const attrs = data?.data?.attributes ?? {};
    const urls = attrs?.urls ?? {};
    const isTestMode = !!attrs?.test_mode;

    return json({
      ok: true,
      subscription: {
        org_id: ctx.org_id,
        external_subscription_id: subscriptionId,
        plan_id: ctx.subscription.plan_id,
        local_status: ctx.subscription.status ?? null,
        provider_status: attrs?.status ?? ctx.subscription.provider_status ?? null,
        valid_until:
          attrs?.renews_at ??
          attrs?.ends_at ??
          ctx.subscription.valid_until ??
          null,
        cancel_at_period_end:
          typeof attrs?.cancelled === "boolean"
            ? attrs.cancelled
            : !!ctx.subscription.cancel_at_period_end,
        scheduled_plan_id: ctx.subscription.scheduled_plan_id ?? null,
        scheduled_plan_change_at: ctx.subscription.scheduled_plan_change_at ?? null,
        test_mode: isTestMode,
      },

      links: {
        customer_portal: urls?.customer_portal ?? null,
        update_payment_method: urls?.update_payment_method ?? null,
        update_customer_portal:
          urls?.customer_portal_update_subscription ?? null,
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

    const lemonApiKey = resolveLemonApiKey(
  isTestVariant(ctx.subscription.external_variant_id)
);

const lemonCurrent = await lemonFetch(
  `/v1/subscriptions/${subscriptionId}`,
  lemonApiKey
);

    if (!lemonCurrent.res.ok) {
      return json(
        {
          ok: false,
          error: "lemonsqueezy_fetch_failed",
          details: extractLemonErrorDetails(lemonCurrent.data),
          raw: lemonCurrent.data,
        },
        502
      );
    }

    const currentAttrs = lemonCurrent.data?.data?.attributes ?? {};
    const isTestMode = !!currentAttrs?.test_mode;

    if (action === "cancel") {
      const { res, data } = await lemonFetch(
  `/v1/subscriptions/${subscriptionId}`,
  lemonApiKey,
  {
    method: "DELETE",
  }
);

      if (!res.ok) {
        return json(
          {
            ok: false,
            error: "lemonsqueezy_cancel_failed",
            details: extractLemonErrorDetails(data),
            raw: data,
          },
          502
        );
      }

      return json({
        ok: true,
        action: "cancel",
        message:
          "Pretplata je otkazana i ostaje aktivna do kraja plaćenog perioda.",
      });
    }

    if (action === "resume") {
      const currentProviderStatus = String(currentAttrs?.status || "")
        .trim()
        .toLowerCase();

      if (currentProviderStatus === "expired") {
        return json(
          {
            ok: false,
            error: "subscription_already_expired",
            message:
              "Pretplata je istekla. Staru pretplatu nije moguće nastaviti; potrebno je otvoriti billing portal ili napraviti novu kupovinu.",
          },
          409
        );
      }

      const payload = {
        data: {
          type: "subscriptions",
          id: subscriptionId,
          attributes: {
            cancelled: false,
          },
        },
      };

      const { res, data } = await lemonFetch(
  `/v1/subscriptions/${subscriptionId}`,
  lemonApiKey,
  {
    method: "PATCH",
    body: JSON.stringify(payload),
  }
);

      if (!res.ok) {
        return json(
          {
            ok: false,
            error: "lemonsqueezy_resume_failed",
            details: extractLemonErrorDetails(data),
            raw: data,
          },
          502
        );
      }

      return json({
        ok: true,
        action: "resume",
        message: "Automatska pretplata je ponovo uključena.",
      });
    }

    if (action === "cancel_scheduled_downgrade") {
      const { error: clearErr } = await supabaseAdmin
        .from("subscriptions")
        .update({
          scheduled_plan_id: null,
          scheduled_plan_change_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("external_subscription_id", subscriptionId);

      if (clearErr) {
        return json(
          {
            ok: false,
            error: "cancel_scheduled_downgrade_failed",
            details: clearErr.message,
          },
          500
        );
      }

      return json({
        ok: true,
        action: "cancel_scheduled_downgrade",
        message: "Zakazano smanjenje plana je otkazano.",
      });
    }

    if (action === "change_plan") {
      const currentPlanId = normalizePlanId(ctx.subscription.plan_id);
      const newPlanId = normalizePlanId(body?.plan_id);

      if (!newPlanId) {
        return json({ ok: false, error: "missing_plan_id" }, 400);
      }

      if (!currentPlanId) {
        return json({ ok: false, error: "unknown_current_plan_id" }, 400);
      }

      if (newPlanId === currentPlanId) {
        return json({ ok: false, error: "same_plan" }, 400);
      }

      const currentRank = PLAN_ORDER[currentPlanId];
      const newRank = PLAN_ORDER[newPlanId];

      const isUpgrade = newRank > currentRank;
      const isDowngrade = newRank < currentRank;

      if (isDowngrade) {
        const scheduledAt =
          currentAttrs?.renews_at ??
          ctx.subscription.valid_until ??
          null;

        const { error: scheduleErr } = await supabaseAdmin
          .from("subscriptions")
          .update({
            scheduled_plan_id: newPlanId,
            scheduled_plan_change_at: scheduledAt,
            updated_at: new Date().toISOString(),
          })
          .eq("external_subscription_id", subscriptionId);

        if (scheduleErr) {
          return json(
            {
              ok: false,
              error: "schedule_downgrade_failed",
              details: scheduleErr.message,
            },
            500
          );
        }

        return json({
          ok: true,
          action: "schedule_downgrade",
          scheduled_plan_id: newPlanId,
          scheduled_plan_change_at: scheduledAt,
          message:
            "Smanjenje plana je zakazano za sledeći obračunski period.",
        });
      }

      const variantId = mapPlanToVariantId(newPlanId, isTestMode);

      const payload = {
        data: {
          type: "subscriptions",
          id: subscriptionId,
          attributes: {
            variant_id: variantId,
            invoice_immediately: isUpgrade,
            disable_prorations: false,
          },
        },
      };

      const { res, data } = await lemonFetch(
  `/v1/subscriptions/${subscriptionId}`,
  lemonApiKey,
  {
    method: "PATCH",
    body: JSON.stringify(payload),
  }
);

      if (!res.ok) {
        return json(
          {
            ok: false,
            error: "lemonsqueezy_change_plan_failed",
            details: extractLemonErrorDetails(data),
            raw: data,
          },
          502
        );
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          scheduled_plan_id: null,
          scheduled_plan_change_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("external_subscription_id", subscriptionId);

      return json({
        ok: true,
        action: "change_plan",
        upgrade: isUpgrade,
        message: isUpgrade
          ? "Plan je odmah povećan i proracija je naplaćena."
          : "Promena plana je poslata.",
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
