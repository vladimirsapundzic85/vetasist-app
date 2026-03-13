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

type PlanId = "basic" | "team" | "pro" | "exclusive";

type PlanInfo = {
  plan: PlanId;
  device_limit: number;
};

const PLAN_MAP: Record<number, PlanInfo> = {
  // LIVE
  1358750: { plan: "basic", device_limit: 1 },
  1394223: { plan: "team", device_limit: 3 },
  1395047: { plan: "pro", device_limit: 10 },
  1395048: { plan: "exclusive", device_limit: 30 },

  // TEST
  1395337: { plan: "basic", device_limit: 1 },
};

const HANDLED_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_plan_changed",
]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function safeString(value: unknown): string {
  return String(value || "").trim();
}

function verifySignature(body: string, signature: string): boolean {
  try {
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
    const digest = hmac.update(body).digest("hex");

    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(String(signature || ""), "utf8");

    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function generateLicenseKey(): string {
  const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VTS-${part()}-${part()}-${part()}`;
}

function resolvePlanInfo(variantId: number, productNameRaw: string): PlanInfo | null {
  if (PLAN_MAP[variantId]) return PLAN_MAP[variantId];

  const productName = String(productNameRaw || "").trim().toLowerCase();

  if (productName.includes("basic")) {
    return { plan: "basic", device_limit: 1 };
  }
  if (productName.includes("team")) {
    return { plan: "team", device_limit: 3 };
  }
  if (productName.includes("pro")) {
    return { plan: "pro", device_limit: 10 };
  }
  if (productName.includes("exclusive")) {
    return { plan: "exclusive", device_limit: 30 };
  }

  return null;
}

function mapProviderStatusToLocalStatus(providerStatus: string): "active" | "inactive" {
  const s = String(providerStatus || "").trim().toLowerCase();

  // Sve osim expired tretiramo kao pristup aktivan.
  // Pravi provider status ide u provider_status kolonu.
  if (s === "expired") return "inactive";
  return "active";
}

function resolveValidUntil(params: {
  providerStatus: string;
  renewsAt: string | null;
  endsAt: string | null;
}): string | null {
  const s = String(params.providerStatus || "").trim().toLowerCase();
  const renewsAt = params.renewsAt ? safeString(params.renewsAt) : null;
  const endsAt = params.endsAt ? safeString(params.endsAt) : null;

  if (s === "cancelled" && endsAt) return endsAt;
  if (s === "expired" && endsAt) return endsAt;

  return renewsAt || endsAt || null;
}

function isCancelAtPeriodEnd(providerStatus: string, endsAt: string | null): boolean {
  const s = String(providerStatus || "").trim().toLowerCase();
  return s === "cancelled" && !!safeString(endsAt);
}

function extractSubscriptionPayload(body: any) {
  const attrs = body?.data?.attributes ?? {};
  const relationships = body?.data?.relationships ?? {};

  const externalSubscriptionId = safeString(body?.data?.id);
  const providerStatus = safeString(attrs?.status).toLowerCase();

  const externalCustomerId =
    safeString(attrs?.customer_id) ||
    safeString(relationships?.customer?.data?.id) ||
    null;

  const externalVariantIdRaw =
    attrs?.variant_id ??
    attrs?.first_subscription_item?.variant_id ??
    null;

  const externalVariantId =
    externalVariantIdRaw == null || externalVariantIdRaw === ""
      ? null
      : Number(externalVariantIdRaw);

  const email = normalizeEmail(attrs?.user_email || attrs?.customer_email);
  const ownerName = safeString(attrs?.user_name || attrs?.customer_name || email);
  const productName = safeString(attrs?.product_name);

  const renewsAt = safeString(attrs?.renews_at) || null;
  const endsAt = safeString(attrs?.ends_at) || null;

  return {
    event: safeString(body?.meta?.event_name),
    externalSubscriptionId,
    externalCustomerId,
    externalVariantId: Number.isFinite(externalVariantId) ? externalVariantId : null,
    email,
    ownerName,
    productName,
    providerStatus,
    renewsAt,
    endsAt,
  };
}

async function findCanonicalOrganizationByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, owner_email, created_at")
    .ilike("owner_email", normalizedEmail)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`organization_lookup_failed:${error.message}`);
  }

  return data?.[0] ?? null;
}

async function findOrCreateOrganization(params: {
  email: string;
  ownerName: string;
}) {
  const email = normalizeEmail(params.email);
  const ownerName = safeString(params.ownerName) || email;

  if (!email) {
    throw new Error("missing_owner_email");
  }

  const existing = await findCanonicalOrganizationByEmail(email);
  if (existing) {
    // Po želji osveži ime ako je prazno ili loše.
    if (!safeString(existing.name) && ownerName) {
      const { error } = await supabase
        .from("organizations")
        .update({ name: ownerName })
        .eq("id", existing.id);

      if (error) {
        throw new Error(`organization_update_failed:${error.message}`);
      }
    }

    return existing;
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: ownerName,
      owner_email: email,
    })
    .select("id, name, owner_email, created_at")
    .single();

  if (error || !data) {
    throw new Error(`organization_insert_failed:${error?.message || "unknown"}`);
  }

  return data;
}

async function findExistingSubscription(params: {
  externalSubscriptionId: string;
  orgId: string;
}) {
  const externalSubscriptionId = safeString(params.externalSubscriptionId);
  const orgId = safeString(params.orgId);

  if (externalSubscriptionId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("external_subscription_id", externalSubscriptionId)
      .maybeSingle();

    if (error) {
      throw new Error(`subscription_lookup_by_external_id_failed:${error.message}`);
    }

    if (data) return data;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`subscription_lookup_by_org_failed:${error.message}`);
  }

  return data ?? null;
}

async function upsertSubscription(params: {
  orgId: string;
  externalSubscriptionId: string;
  externalCustomerId: string | null;
  externalVariantId: number | null;
  planId: PlanId;
  providerStatus: string;
  localStatus: "active" | "inactive";
  validUntil: string | null;
  cancelAtPeriodEnd: boolean;
  event: string;
}) {
  const existing = await findExistingSubscription({
    externalSubscriptionId: params.externalSubscriptionId,
    orgId: params.orgId,
  });

  const payload = {
    org_id: params.orgId,
    plan_id: params.planId,
    status: params.localStatus,
    valid_until: params.validUntil,
    external_provider: "lemonsqueezy",
    external_subscription_id: safeString(params.externalSubscriptionId) || null,
    external_customer_id: params.externalCustomerId,
    external_variant_id: params.externalVariantId,
    provider_status: params.providerStatus || null,
    scheduled_plan_id: null,
    cancel_at_period_end: params.cancelAtPeriodEnd,
    last_webhook_event: params.event,
    last_webhook_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("subscriptions")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`subscription_update_failed:${error?.message || "unknown"}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`subscription_insert_failed:${error?.message || "unknown"}`);
  }

  return data;
}

async function ensureSingleActiveLicense(params: {
  orgId: string;
  planId: PlanId;
}) {
  const orgId = safeString(params.orgId);
  const planId = safeString(params.planId);

  const { data: activeLicenses, error } = await supabase
    .from("license_keys")
    .select("license_key, created_at, is_active, org_id, plan")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`license_lookup_failed:${error.message}`);
  }

  if (activeLicenses && activeLicenses.length > 0) {
    const primary = activeLicenses[0];
    const extras = activeLicenses.slice(1).map((x) => x.license_key);

    if (extras.length > 0) {
      const { error: deactivateErr } = await supabase
        .from("license_keys")
        .update({ is_active: false })
        .in("license_key", extras);

      if (deactivateErr) {
        throw new Error(`license_deactivate_extras_failed:${deactivateErr.message}`);
      }
    }

    if (safeString(primary.plan) !== planId) {
      const { error: updateErr } = await supabase
        .from("license_keys")
        .update({ plan: planId })
        .eq("license_key", primary.license_key);

      if (updateErr) {
        throw new Error(`license_plan_snapshot_update_failed:${updateErr.message}`);
      }
    }

    return primary.license_key;
  }

  let licenseKey = "";
  let inserted = false;
  let attempts = 0;

  while (!inserted && attempts < 10) {
    attempts += 1;
    licenseKey = generateLicenseKey();

    const { error: insertErr } = await supabase
      .from("license_keys")
      .insert({
        license_key: licenseKey,
        org_id: orgId,
        is_active: true,
        plan: planId,
      });

    if (!insertErr) {
      inserted = true;
      break;
    }

    if (!String(insertErr.message || "").toLowerCase().includes("duplicate")) {
      throw new Error(`license_insert_failed:${insertErr.message}`);
    }
  }

  if (!inserted) {
    throw new Error("license_generation_failed");
  }

  return licenseKey;
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-signature") || "";

    if (!verifySignature(bodyText, signature)) {
      return json({ ok: false, error: "invalid_signature" }, 401);
    }

    const body = JSON.parse(bodyText);
    const payload = extractSubscriptionPayload(body);

    if (!HANDLED_EVENTS.has(payload.event)) {
      return json({ ok: true, ignored: true, event: payload.event });
    }

    if (!payload.externalSubscriptionId) {
      return json(
        { ok: false, error: "missing_external_subscription_id", event: payload.event },
        400
      );
    }

    if (!payload.email) {
      return json({ ok: false, error: "missing_owner_email", event: payload.event }, 400);
    }

    const planInfo = resolvePlanInfo(
      payload.externalVariantId ?? 0,
      payload.productName
    );

    if (!planInfo) {
      return json(
        {
          ok: false,
          error: "unknown_variant_id",
          event: payload.event,
          variant_id: payload.externalVariantId,
          product_name: payload.productName,
        },
        400
      );
    }

    const org = await findOrCreateOrganization({
      email: payload.email,
      ownerName: payload.ownerName,
    });

    const localStatus = mapProviderStatusToLocalStatus(payload.providerStatus);
    const validUntil = resolveValidUntil({
      providerStatus: payload.providerStatus,
      renewsAt: payload.renewsAt,
      endsAt: payload.endsAt,
    });

    const subscription = await upsertSubscription({
      orgId: org.id,
      externalSubscriptionId: payload.externalSubscriptionId,
      externalCustomerId: payload.externalCustomerId,
      externalVariantId: payload.externalVariantId,
      planId: planInfo.plan,
      providerStatus: payload.providerStatus,
      localStatus,
      validUntil,
      cancelAtPeriodEnd: isCancelAtPeriodEnd(payload.providerStatus, payload.endsAt),
      event: payload.event,
    });

    let licenseKey: string | null = null;

    if (localStatus === "active") {
      licenseKey = await ensureSingleActiveLicense({
        orgId: org.id,
        planId: planInfo.plan,
      });
    } else {
      // expired → deaktiviraj aktivne licence za taj org
      const { error: deactivateErr } = await supabase
        .from("license_keys")
        .update({ is_active: false })
        .eq("org_id", org.id)
        .eq("is_active", true);

      if (deactivateErr) {
        throw new Error(`license_deactivate_failed:${deactivateErr.message}`);
      }
    }

    return json({
      ok: true,
      event: payload.event,
      org_id: org.id,
      owner_email: payload.email,
      subscription_id: subscription.id,
      external_subscription_id: payload.externalSubscriptionId,
      plan: planInfo.plan,
      provider_status: payload.providerStatus,
      local_status: localStatus,
      valid_until: validUntil,
      cancel_at_period_end: isCancelAtPeriodEnd(payload.providerStatus, payload.endsAt),
      license_key: licenseKey,
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
