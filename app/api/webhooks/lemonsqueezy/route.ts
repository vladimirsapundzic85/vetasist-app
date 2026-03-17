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
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";
const SEND_LICENSE_EMAILS_IN_TEST_MODE =
  String(process.env.SEND_LICENSE_EMAILS_IN_TEST_MODE || "false").toLowerCase() === "true";

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
  "subscription_payment_success",
  "subscription_payment_failed",
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

  if (productName.includes("basic")) return { plan: "basic", device_limit: 1 };
  if (productName.includes("team")) return { plan: "team", device_limit: 3 };
  if (productName.includes("pro")) return { plan: "pro", device_limit: 10 };
  if (productName.includes("exclusive")) return { plan: "exclusive", device_limit: 30 };

  return null;
}

function mapProviderStatusToLocalStatus(providerStatus: string): "active" | "inactive" {
  const s = String(providerStatus || "").trim().toLowerCase();

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

function formatDate(value: string | null): string {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("sr-RS");
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
  const testMode = !!attrs?.test_mode || !!body?.meta?.test_mode;

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
    testMode,
  };
}

async function findCanonicalOrganizationByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, owner_email, created_at")
    .eq("owner_email", normalizedEmail)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`organization_lookup_failed:${error.message}`);
  }

  if (!data || data.length === 0) return null;

  if (data.length > 1) {
    throw new Error(`duplicate_owner_email:${normalizedEmail}`);
  }

  return data[0];
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
    let query = supabase.from("subscriptions").update(payload);

    if (safeString(existing.external_subscription_id)) {
      query = query.eq("external_subscription_id", safeString(existing.external_subscription_id));
    } else {
      query = query.eq("org_id", params.orgId);
    }

    const { data, error } = await query.select("*").single();

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

async function ensureCanonicalLicenseForOrg(params: {
  orgId: string;
  planId: PlanId;
}) {
  const orgId = safeString(params.orgId);
  const planId = safeString(params.planId);

  const { data: licenses, error } = await supabase
    .from("license_keys")
    .select("license_key, created_at, is_active, org_id, plan")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`license_lookup_failed:${error.message}`);
  }

  if (licenses && licenses.length > 0) {
    const canonical = licenses[0];
    const otherKeys = licenses.slice(1).map((x) => x.license_key);

    if (!canonical.is_active || safeString(canonical.plan) !== planId) {
      const { error: canonicalUpdateErr } = await supabase
        .from("license_keys")
        .update({
          is_active: true,
          plan: planId,
        })
        .eq("license_key", canonical.license_key);

      if (canonicalUpdateErr) {
        throw new Error(`license_canonical_update_failed:${canonicalUpdateErr.message}`);
      }
    }

    if (otherKeys.length > 0) {
      const { error: deactivateErr } = await supabase
        .from("license_keys")
        .update({ is_active: false })
        .in("license_key", otherKeys);

      if (deactivateErr) {
        throw new Error(`license_deactivate_extras_failed:${deactivateErr.message}`);
      }
    }

    return canonical.license_key;
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

async function deactivateAllLicensesForOrg(orgId: string) {
  const { error } = await supabase
    .from("license_keys")
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`license_deactivate_failed:${error.message}`);
  }
}

async function sendLicenseEmail(params: {
  to: string;
  ownerName: string;
  plan: string;
  deviceLimit: number;
  validUntil: string | null;
  licenseKey: string;
  testMode: boolean;
}) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn("VetAssist: email skipped because RESEND env is missing");
    return { ok: false, skipped: true, reason: "missing_resend_env" as const };
  }

  if (params.testMode && !SEND_LICENSE_EMAILS_IN_TEST_MODE) {
    console.warn("VetAssist: email skipped in test mode");
    return { ok: false, skipped: true, reason: "test_mode_disabled" as const };
  }

  const ownerName = safeString(params.ownerName) || "korisniče";
  const validUntil = formatDate(params.validUntil);

  const subject = `VetAssist licenca — ${params.plan}`;
  const text = [
    `Poštovani ${ownerName},`,
    ``,
    `Vaša VetAssist pretplata je aktivna.`,
    `Plan: ${params.plan}`,
    `Dozvoljeno uređaja: ${params.deviceLimit}`,
    `Važi do: ${validUntil}`,
    ``,
    `Vaš license key:`,
    `${params.licenseKey}`,
    ``,
    `Dalji koraci:`,
    `1. Instalirajte VetAssist ekstenziju.`,
    `2. Otvorite AIRS.`,
    `3. Unesite license key i sačuvajte licencu.`,
    ``,
    `VetAssist`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#222;">
      <h1 style="font-size:24px;">VetAssist licenca</h1>
      <p>Poštovani ${escapeHtml(ownerName)},</p>
      <p>Vaša VetAssist pretplata je aktivna.</p>

      <table style="border-collapse:collapse;margin:16px 0;">
        <tr>
          <td style="padding:6px 12px 6px 0;"><strong>Plan:</strong></td>
          <td style="padding:6px 0;">${escapeHtml(params.plan)}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;"><strong>Dozvoljeno uređaja:</strong></td>
          <td style="padding:6px 0;">${params.deviceLimit}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;"><strong>Važi do:</strong></td>
          <td style="padding:6px 0;">${escapeHtml(validUntil)}</td>
        </tr>
      </table>

      <div style="margin:20px 0;padding:16px;background:#f6f6f6;border:1px solid #e5e5e5;border-radius:10px;">
        <div style="margin-bottom:8px;font-weight:700;">Vaš license key</div>
        <div style="font-size:24px;font-weight:700;letter-spacing:1px;word-break:break-word;">
          ${escapeHtml(params.licenseKey)}
        </div>
      </div>

      <h2 style="font-size:18px;">Dalji koraci</h2>
      <ol>
        <li>Instalirajte VetAssist ekstenziju.</li>
        <li>Otvorite AIRS.</li>
        <li>Unesite license key i sačuvajte licencu.</li>
      </ol>

      <p style="margin-top:24px;">
        <a
          href="https://vetasist.carrd.co/"
          target="_blank"
          rel="noreferrer"
          style="display:inline-block;padding:12px 18px;border-radius:8px;text-decoration:none;border:1px solid #222;color:#222;font-weight:700;"
        >
          Otvori VetAssist sajt
        </a>
      </p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [params.to],
      subject,
      html,
      text,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`resend_send_failed:${res.status}:${JSON.stringify(data)}`);
  }

  return { ok: true, data };
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

    await upsertSubscription({
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
    let emailResult: unknown = null;

    if (localStatus === "active") {
      licenseKey = await ensureCanonicalLicenseForOrg({
        orgId: org.id,
        planId: planInfo.plan,
      });

      if (
        licenseKey &&
        (payload.event === "subscription_created" || payload.event === "subscription_resumed")
      ) {
        emailResult = await sendLicenseEmail({
          to: payload.email,
          ownerName: payload.ownerName,
          plan: planInfo.plan,
          deviceLimit: planInfo.device_limit,
          validUntil,
          licenseKey,
          testMode: payload.testMode,
        });
      }
    } else {
      await deactivateAllLicensesForOrg(org.id);
    }

    return json({
      ok: true,
      event: payload.event,
      org_id: org.id,
      owner_email: payload.email,
      external_subscription_id: payload.externalSubscriptionId,
      plan: planInfo.plan,
      provider_status: payload.providerStatus,
      local_status: localStatus,
      valid_until: validUntil,
      cancel_at_period_end: isCancelAtPeriodEnd(payload.providerStatus, payload.endsAt),
      license_key: licenseKey,
      email_result: emailResult,
    });
  } catch (err) {
    const details = err instanceof Error ? err.message : "unknown_server_error";

    if (String(details).startsWith("duplicate_owner_email:")) {
      return json(
        {
          ok: false,
          error: "duplicate_owner_email",
          details,
        },
        409
      );
    }

    return json(
      {
        ok: false,
        error: "server_error",
        details,
      },
      500
    );
  }
}
