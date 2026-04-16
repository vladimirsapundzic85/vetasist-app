import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PlanId = "basic" | "team" | "pro" | "exclusive" | string;

export type LicenseLookupResult =
  | {
      ok: true;
      org_id: string;
      is_active: boolean;
      subscription: {
        status: string;
        plan_id: string;
        valid_until: string | null;
      };
    }
  | {
      ok: false;
      error:
        | "license_key_not_found"
        | "license_key_inactive"
        | "no_subscription"
        | "inactive_license"
        | "expired"
        | "server_error";
      details?: string | null;
    };

export type DeviceRegistrationResult =
  | {
      ok: true;
      limit: number;
      isNewDevice: boolean;
      deviceCount: number;
    }
  | {
      ok: false;
      error:
        | "device_limit_reached"
        | "device_lookup_failed"
        | "device_insert_failed"
        | "device_update_failed"
        | "current_key_device_lookup_failed"
        | "device_reset_cooldown_active"
        | "device_revoked"
        | "server_error";
      details?: string | null;
      limit?: number;
      deviceCount?: number;
      blockedUntil?: string | null;
      resetLimit?: number;
      resetCount?: number;
    };

export type AvailableToolItem = {
  code: string;
  name: string;
  description: string;
  version: string;
  category: string;
  species: string;
  badge?: string;
};

export type DeviceResetResult =
  | {
      ok: true;
      action: "reset" | "restore";
      licenseKey: string;
      orgId: string;
      deviceId: string | null;
      deviceFp: string;
      resetCount: number;
      resetLimit: number;
      blockedUntil: string | null;
    }
  | {
      ok: false;
      error:
        | "license_key_not_found"
        | "license_key_inactive"
        | "no_subscription"
        | "inactive_license"
        | "expired"
        | "device_not_found"
        | "device_not_reset_blocked"
        | "device_limit_reached"
        | "reset_limit_reached"
        | "owner_restore_window_expired"
        | "server_error";
      details?: string | null;
      resetCount?: number;
      resetLimit?: number;
      blockedUntil?: string | null;
    };

const DEVICE_PASSIVE_AFTER_DAYS = 45;
const RESET_COOLDOWN_DAYS = 30;
const OWNER_RESET_UNDO_MINUTES = 10;

type LicenseDeviceRow = {
  license_key: string;
  device_id: string | null;
  device_fp: string | null;
  status: string | null;
  blocked_until: string | null;
};

async function getDeviceLimitForPlan(plan: PlanId): Promise<number> {
  const normalizedPlan = String(plan || "").trim();

  if (!normalizedPlan) return 1;

  const { data, error } = await supabase
    .from("plans")
    .select("device_limit")
    .eq("id", normalizedPlan)
    .single();

  if (error || !data) {
    return 1;
  }

  const limit = Number(data.device_limit);
  if (!Number.isFinite(limit) || limit <= 0) {
    return 1;
  }

  return limit;
}

async function getMonthlyResetLimitForPlan(plan: PlanId): Promise<number> {
  const normalizedPlan = String(plan || "").trim();

  if (!normalizedPlan) return 0;

  const { data, error } = await supabase
    .from("plans")
    .select("monthly_device_resets")
    .eq("id", normalizedPlan)
    .single();

  if (error || !data) {
    return 0;
  }

  const limit = Number(data.monthly_device_resets);
  if (!Number.isFinite(limit) || limit < 0) {
    return 0;
  }

  return limit;
}

function getCurrentMonthStartIso(): string {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  return start.toISOString();
}

async function countMonthlyDeviceResets(license_key: string): Promise<number> {
  const monthStart = getCurrentMonthStartIso();

  const { count, error } = await supabase
    .from("license_device_resets")
    .select("*", { count: "exact", head: true })
    .eq("license_key", license_key)
    .eq("action", "reset")
    .gte("created_at", monthStart);

  if (error) {
    throw new Error(`count_monthly_device_resets_failed:${error.message}`);
  }

  return count ?? 0;
}

export async function resolveLicenseContext(
  license_key: string
): Promise<LicenseLookupResult> {
  try {
    const normalizedKey = String(license_key || "").trim();

    const { data: lk, error: lkErr } = await supabase
      .from("license_keys")
      .select("org_id, is_active")
      .eq("license_key", normalizedKey)
      .single();

    if (lkErr || !lk) {
      return { ok: false, error: "license_key_not_found" };
    }

    if (!lk.is_active) {
      return { ok: false, error: "license_key_inactive" };
    }

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("status, plan_id, valid_until")
      .eq("org_id", lk.org_id)
      .single();

    if (subErr || !sub) {
      return { ok: false, error: "no_subscription" };
    }

    if (sub.status !== "active") {
      return { ok: false, error: "inactive_license" };
    }

    if (sub.valid_until && new Date(sub.valid_until) < new Date()) {
      return { ok: false, error: "expired" };
    }

    return {
      ok: true,
      org_id: lk.org_id,
      is_active: !!lk.is_active,
      subscription: {
        status: String(sub.status || ""),
        plan_id: String(sub.plan_id || ""),
        valid_until: sub.valid_until ?? null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: "server_error",
      details: err instanceof Error ? err.message : "unknown_server_error",
    };
  }
}

async function passivizeStaleDevices(license_key: string): Promise<void> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - DEVICE_PASSIVE_AFTER_DAYS * 24 * 60 * 60 * 1000
  );

  const { error } = await supabase
    .from("license_devices")
    .update({
      status: "passive",
      passive_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("license_key", license_key)
    .eq("status", "active")
    .lt("last_seen", cutoff.toISOString());

  if (error) {
    throw new Error(`passivize_stale_devices_failed:${error.message}`);
  }
}

async function countActiveDevicesForLicense(license_key: string): Promise<number> {
  const { count, error } = await supabase
    .from("license_devices")
    .select("*", { count: "exact", head: true })
    .eq("license_key", license_key)
    .eq("status", "active");

  if (error) {
    throw new Error(`count_active_devices_failed:${error.message}`);
  }

  return count ?? 0;
}

async function findDeviceByFingerprint(
  license_key: string,
  device_fp: string
): Promise<LicenseDeviceRow | null> {
  const { data, error } = await supabase
    .from("license_devices")
    .select("license_key, device_id, device_fp, status, blocked_until")
    .eq("license_key", license_key)
    .eq("device_fp", device_fp)
    .maybeSingle();

  if (error) {
    throw new Error(`find_device_by_fingerprint_failed:${error.message}`);
  }

  return (data as LicenseDeviceRow | null) ?? null;
}

async function findDeviceByDeviceId(
  license_key: string,
  device_id: string
): Promise<LicenseDeviceRow | null> {
  const { data, error } = await supabase
    .from("license_devices")
    .select("license_key, device_id, device_fp, status, blocked_until")
    .eq("license_key", license_key)
    .eq("device_id", device_id)
    .maybeSingle();

  if (error) {
    throw new Error(`find_device_by_device_id_failed:${error.message}`);
  }

  return (data as LicenseDeviceRow | null) ?? null;
}

async function updateExistingDeviceRow(params: {
  license_key: string;
  matchBy: "device_fp" | "device_id";
  matchValue: string;
  device_id: string;
  device_fp: string;
  nowIso: string;
  limit: number;
  resetLimit: number;
  resetCount: number;
  row: LicenseDeviceRow;
}): Promise<DeviceRegistrationResult> {
  const {
    license_key,
    matchBy,
    matchValue,
    device_id,
    device_fp,
    nowIso,
    limit,
    resetLimit,
    resetCount,
    row,
  } = params;

  const currentStatus = String(row.status || "").trim();
  const blockedUntil = row.blocked_until ? String(row.blocked_until) : null;

  if (currentStatus === "revoked") {
    return {
      ok: false,
      error: "device_revoked",
      details: "device_is_revoked",
      limit,
      resetLimit,
      resetCount,
    };
  }

  const matchColumn = matchBy === "device_fp" ? "device_fp" : "device_id";

  if (currentStatus === "reset_blocked") {
    if (blockedUntil && new Date(blockedUntil) > new Date()) {
      return {
        ok: false,
        error: "device_reset_cooldown_active",
        details: "device_is_under_reset_cooldown",
        limit,
        blockedUntil,
        resetLimit,
        resetCount,
      };
    }

    const activeCount = await countActiveDevicesForLicense(license_key);
    if (activeCount >= limit) {
      return {
        ok: false,
        error: "device_limit_reached",
        limit,
        deviceCount: activeCount,
        resetLimit,
        resetCount,
      };
    }

    const { error: reactivateErr } = await supabase
      .from("license_devices")
      .update({
        device_id,
        device_fp,
        status: "active",
        blocked_until: null,
        last_seen: nowIso,
        updated_at: nowIso,
      })
      .eq("license_key", license_key)
      .eq(matchColumn, matchValue);

    if (reactivateErr) {
      return {
        ok: false,
        error: "device_update_failed",
        details: reactivateErr.message ?? null,
      };
    }

    return {
      ok: true,
      limit,
      isNewDevice: false,
      deviceCount: activeCount + 1,
    };
  }

  if (currentStatus === "passive") {
    const activeCount = await countActiveDevicesForLicense(license_key);
    if (activeCount >= limit) {
      return {
        ok: false,
        error: "device_limit_reached",
        limit,
        deviceCount: activeCount,
        resetLimit,
        resetCount,
      };
    }

    const { error: reactivateErr } = await supabase
      .from("license_devices")
      .update({
        device_id,
        device_fp,
        status: "active",
        passive_at: null,
        last_seen: nowIso,
        updated_at: nowIso,
      })
      .eq("license_key", license_key)
      .eq(matchColumn, matchValue);

    if (reactivateErr) {
      return {
        ok: false,
        error: "device_update_failed",
        details: reactivateErr.message ?? null,
      };
    }

    return {
      ok: true,
      limit,
      isNewDevice: false,
      deviceCount: activeCount + 1,
    };
  }

  const { error: updateErr } = await supabase
    .from("license_devices")
    .update({
      device_id,
      device_fp,
      last_seen: nowIso,
      updated_at: nowIso,
    })
    .eq("license_key", license_key)
    .eq(matchColumn, matchValue);

  if (updateErr) {
    return {
      ok: false,
      error: "device_update_failed",
      details: updateErr.message ?? null,
    };
  }

  const activeCount = await countActiveDevicesForLicense(license_key);

  return {
    ok: true,
    limit,
    isNewDevice: false,
    deviceCount: activeCount,
  };
}

export async function registerOrCheckDevice(params: {
  license_key: string;
  device_id: string;
  device_fp?: string | null;
}): Promise<DeviceRegistrationResult> {
  try {
    const license_key = String(params.license_key || "").trim();
    const device_id = String(params.device_id || "").trim();
    const device_fp = String(params.device_fp || device_id).trim();
    console.log("DEVICE INPUT:", {
  license_key,
  device_id,
  device_fp,
});

if (device_fp && device_fp.startsWith("fp_")) {
  console.log("FINGERPRINT MODE ACTIVE");
}

    const context = await resolveLicenseContext(license_key);
    if (!context.ok) {
      return {
        ok: false,
        error: "server_error",
        details: `license_context_failed:${context.error}`,
      };
    }

    const planId = context.subscription.plan_id;
    const limit = await getDeviceLimitForPlan(planId);
    const resetLimit = await getMonthlyResetLimitForPlan(planId);
    const resetCount = await countMonthlyDeviceResets(license_key);
    const nowIso = new Date().toISOString();

    await passivizeStaleDevices(license_key);

    // 1) PRIMARNO: traži uređaj po fingerprintu
    const currentFpDevice = await findDeviceByFingerprint(license_key, device_fp);

    if (currentFpDevice) {
      return await updateExistingDeviceRow({
        license_key,
        matchBy: "device_fp",
        matchValue: device_fp,
        device_id,
        device_fp,
        nowIso,
        limit,
        resetLimit,
        resetCount,
        row: currentFpDevice,
      });
    }

    // 2) LEGACY FALLBACK: traži po device_id, pa ga migriraj na fingerprint
    const currentIdDevice = await findDeviceByDeviceId(license_key, device_id);

    if (currentIdDevice) {
      return await updateExistingDeviceRow({
        license_key,
        matchBy: "device_id",
        matchValue: device_id,
        device_id,
        device_fp,
        nowIso,
        limit,
        resetLimit,
        resetCount,
        row: currentIdDevice,
      });
    }

    // 3) NOV UREĐAJ: tek sad proveri limit i insert
    const activeCount = await countActiveDevicesForLicense(license_key);

    if (activeCount >= limit) {
      return {
        ok: false,
        error: "device_limit_reached",
        limit,
        deviceCount: activeCount,
        resetLimit,
        resetCount,
      };
    }

    const { error: insertErr } = await supabase
      .from("license_devices")
      .insert({
        license_key,
        device_id,
        device_fp,
        first_seen: nowIso,
        last_seen: nowIso,
        status: "active",
        passive_at: null,
        revoked_at: null,
        notes: null,
        updated_at: nowIso,
        blocked_until: null,
        reset_at: null,
        reset_reason: null,
      });

    if (insertErr) {
      return {
        ok: false,
        error: "device_insert_failed",
        details: insertErr.message ?? null,
      };
    }

    return {
      ok: true,
      limit,
      isNewDevice: true,
      deviceCount: activeCount + 1,
    };
  } catch (err) {
    return {
      ok: false,
      error: "server_error",
      details: err instanceof Error ? err.message : "unknown_server_error",
    };
  }
}

async function getLicenseOrgAndPlan(license_key: string): Promise<{
  orgId: string;
  planId: string;
} | null> {
  const context = await resolveLicenseContext(license_key);
  if (!context.ok) return null;

  return {
    orgId: context.org_id,
    planId: context.subscription.plan_id,
  };
}

async function insertDeviceResetLog(params: {
  license_key: string;
  org_id: string;
  device_id: string | null;
  device_fp: string;
  action: "reset" | "restore";
  performed_by?: string | null;
  reason?: string | null;
}) {
  const { error } = await supabase
    .from("license_device_resets")
    .insert({
      license_key: params.license_key,
      org_id: params.org_id,
      device_id: params.device_id,
      device_fp: params.device_fp,
      action: params.action,
      performed_by: params.performed_by ?? null,
      reason: params.reason ?? null,
    });

  if (error) {
    throw new Error(`device_reset_log_insert_failed:${error.message}`);
  }
}

export async function resetDeviceForLicense(params: {
  license_key: string;
  device_fp: string;
  performed_by?: string | null;
  reason?: string | null;
}): Promise<DeviceResetResult> {
  try {
    const license_key = String(params.license_key || "").trim();
    const device_fp = String(params.device_fp || "").trim();

    if (!license_key) {
      return { ok: false, error: "license_key_not_found" };
    }

    if (!device_fp) {
      return { ok: false, error: "device_not_found" };
    }

    const info = await getLicenseOrgAndPlan(license_key);
    if (!info) {
      const context = await resolveLicenseContext(license_key);
      return {
        ok: false,
        error: context.ok ? "server_error" : context.error,
        details: context.ok ? "license_context_unexpected" : context.details ?? null,
      };
    }

    const resetLimit = await getMonthlyResetLimitForPlan(info.planId);
    const resetCount = await countMonthlyDeviceResets(license_key);

    if (resetCount >= resetLimit) {
      return {
        ok: false,
        error: "reset_limit_reached",
        resetCount,
        resetLimit,
      };
    }

    const { data: device, error: deviceErr } = await supabase
      .from("license_devices")
      .select("device_id, device_fp, status, reset_at")
      .eq("license_key", license_key)
      .eq("device_fp", device_fp)
      .maybeSingle();

    if (deviceErr) {
      return {
        ok: false,
        error: "server_error",
        details: deviceErr.message ?? null,
      };
    }

    if (!device) {
      return { ok: false, error: "device_not_found", resetCount, resetLimit };
    }

    const now = new Date();
    const blockedUntil = new Date(
      now.getTime() + RESET_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const effectiveReason = String(params.reason || "").trim() || "admin_reset";

    const { error: updateErr } = await supabase
      .from("license_devices")
      .update({
        status: "reset_blocked",
        blocked_until: blockedUntil,
        reset_at: now.toISOString(),
        reset_reason: effectiveReason,
        updated_at: now.toISOString(),
      })
      .eq("license_key", license_key)
      .eq("device_fp", device_fp);

    if (updateErr) {
      return {
        ok: false,
        error: "server_error",
        details: updateErr.message ?? null,
      };
    }

    await insertDeviceResetLog({
      license_key,
      org_id: info.orgId,
      device_id: device.device_id ?? null,
      device_fp,
      action: "reset",
      performed_by: params.performed_by ?? null,
      reason: effectiveReason,
    });

    return {
      ok: true,
      action: "reset",
      licenseKey: license_key,
      orgId: info.orgId,
      deviceId: device.device_id ?? null,
      deviceFp: device_fp,
      resetCount: resetCount + 1,
      resetLimit,
      blockedUntil,
    };
  } catch (err) {
    return {
      ok: false,
      error: "server_error",
      details: err instanceof Error ? err.message : "unknown_server_error",
    };
  }
}

export async function restoreResetBlockedDevice(params: {
  license_key: string;
  device_fp: string;
  performed_by?: string | null;
  reason?: string | null;
}): Promise<DeviceResetResult> {
  try {
    const license_key = String(params.license_key || "").trim();
    const device_fp = String(params.device_fp || "").trim();

    if (!license_key) {
      return { ok: false, error: "license_key_not_found" };
    }

    if (!device_fp) {
      return { ok: false, error: "device_not_found" };
    }

    const info = await getLicenseOrgAndPlan(license_key);
    if (!info) {
      const context = await resolveLicenseContext(license_key);
      return {
        ok: false,
        error: context.ok ? "server_error" : context.error,
        details: context.ok ? "license_context_unexpected" : context.details ?? null,
      };
    }

    const resetLimit = await getMonthlyResetLimitForPlan(info.planId);
    const resetCount = await countMonthlyDeviceResets(license_key);

    const { data: device, error: deviceErr } = await supabase
      .from("license_devices")
      .select("device_id, device_fp, status, blocked_until, reset_at")
      .eq("license_key", license_key)
      .eq("device_fp", device_fp)
      .maybeSingle();

    if (deviceErr) {
      return {
        ok: false,
        error: "server_error",
        details: deviceErr.message ?? null,
      };
    }

    if (!device) {
      return { ok: false, error: "device_not_found", resetCount, resetLimit };
    }

    if (String(device.status || "") !== "reset_blocked") {
      return {
        ok: false,
        error: "device_not_reset_blocked",
        resetCount,
        resetLimit,
      };
    }

    if (device.reset_at) {
      const resetTime = new Date(device.reset_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - resetTime.getTime()) / (1000 * 60);

      if (diffMinutes > OWNER_RESET_UNDO_MINUTES) {
        return {
          ok: false,
          error: "owner_restore_window_expired",
          details: "owner_restore_time_window_expired",
          resetCount,
          resetLimit,
          blockedUntil: device.blocked_until ?? null,
        };
      }
    }

    const limit = await getDeviceLimitForPlan(info.planId);

    const { count: activeCount, error: activeCountErr } = await supabase
      .from("license_devices")
      .select("*", { count: "exact", head: true })
      .eq("license_key", license_key)
      .eq("status", "active");

    if (activeCountErr) {
      return {
        ok: false,
        error: "server_error",
        details: activeCountErr.message ?? null,
      };
    }

    const currentActiveCount = activeCount ?? 0;
    if (currentActiveCount >= limit) {
      return {
        ok: false,
        error: "device_limit_reached",
        resetCount,
        resetLimit,
      };
    }

    const nowIso = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("license_devices")
      .update({
        status: "active",
        blocked_until: null,
        updated_at: nowIso,
        last_seen: nowIso,
      })
      .eq("license_key", license_key)
      .eq("device_fp", device_fp);

    if (updateErr) {
      return {
        ok: false,
        error: "server_error",
        details: updateErr.message ?? null,
      };
    }

    await insertDeviceResetLog({
      license_key,
      org_id: info.orgId,
      device_id: device.device_id ?? null,
      device_fp,
      action: "restore",
      performed_by: params.performed_by ?? null,
      reason: String(params.reason || "").trim() || "admin_restore",
    });

    return {
      ok: true,
      action: "restore",
      licenseKey: license_key,
      orgId: info.orgId,
      deviceId: device.device_id ?? null,
      deviceFp: device_fp,
      resetCount,
      resetLimit,
      blockedUntil: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: "server_error",
      details: err instanceof Error ? err.message : "unknown_server_error",
    };
  }
}

export async function resetAllDevicesForLicense(params: {
  license_key: string;
  performed_by?: string | null;
  reason?: string | null;
}): Promise<
  | {
      ok: true;
      action: "reset";
      licenseKey: string;
      orgId: string;
      affected: number;
      resetCount: number;
      resetLimit: number;
      blockedUntil: string | null;
    }
  | {
      ok: false;
      error:
        | "license_key_not_found"
        | "license_key_inactive"
        | "no_subscription"
        | "inactive_license"
        | "expired"
        | "reset_limit_reached"
        | "server_error";
      details?: string | null;
      resetCount?: number;
      resetLimit?: number;
    }
> {
  try {
    const license_key = String(params.license_key || "").trim();

    const info = await getLicenseOrgAndPlan(license_key);
    if (!info) {
      const context = await resolveLicenseContext(license_key);
      return {
        ok: false,
        error: context.ok ? "server_error" : context.error,
        details: context.ok ? "license_context_unexpected" : context.details ?? null,
      };
    }

    const { data: devices, error: devicesErr } = await supabase
      .from("license_devices")
      .select("device_id, device_fp, status")
      .eq("license_key", license_key)
      .in("status", ["active", "passive"]);

    if (devicesErr) {
      return {
        ok: false,
        error: "server_error",
        details: devicesErr.message ?? null,
      };
    }

    const rows = devices ?? [];
    const resetLimit = await getMonthlyResetLimitForPlan(info.planId);
    const resetCount = await countMonthlyDeviceResets(license_key);

    if (!rows.length) {
      return {
        ok: true,
        action: "reset",
        licenseKey: license_key,
        orgId: info.orgId,
        affected: 0,
        resetCount,
        resetLimit,
        blockedUntil: null,
      };
    }

    if (resetCount + rows.length > resetLimit) {
      return {
        ok: false,
        error: "reset_limit_reached",
        resetCount,
        resetLimit,
      };
    }

    const now = new Date();
    const blockedUntil = new Date(
      now.getTime() + RESET_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const effectiveReason = String(params.reason || "").trim() || "admin_reset";
    const fps = rows.map((r) => String(r.device_fp || "")).filter(Boolean);

    const { error: updateErr } = await supabase
      .from("license_devices")
      .update({
        status: "reset_blocked",
        blocked_until: blockedUntil,
        reset_at: now.toISOString(),
        reset_reason: effectiveReason,
        updated_at: now.toISOString(),
      })
      .eq("license_key", license_key)
      .in("device_fp", fps);

    if (updateErr) {
      return {
        ok: false,
        error: "server_error",
        details: updateErr.message ?? null,
      };
    }

    const logRows = rows.map((r) => ({
      license_key,
      org_id: info.orgId,
      device_id: r.device_id ?? null,
      device_fp: r.device_fp ?? null,
      action: "reset" as const,
      performed_by: params.performed_by ?? null,
      reason: effectiveReason,
    }));

    const { error: logErr } = await supabase
      .from("license_device_resets")
      .insert(logRows);

    if (logErr) {
      return {
        ok: false,
        error: "server_error",
        details: logErr.message ?? null,
      };
    }

    return {
      ok: true,
      action: "reset",
      licenseKey: license_key,
      orgId: info.orgId,
      affected: rows.length,
      resetCount: resetCount + rows.length,
      resetLimit,
      blockedUntil,
    };
  } catch (err) {
    return {
      ok: false,
      error: "server_error",
      details: err instanceof Error ? err.message : "unknown_server_error",
    };
  }
}

export async function getToolByCode(tool_code: string) {
  const normalizedCode = String(tool_code || "").trim();

  const { data: tool, error } = await supabase
    .from("tools")
    .select("id, code, name, description, species, is_active")
    .eq("code", normalizedCode)
    .single();

  return { data: tool, error };
}

export async function getPlanToolAccess(plan_id: string, tool_id: string) {
  const { data, error } = await supabase
    .from("plan_tools")
    .select("enabled")
    .eq("plan_id", String(plan_id || "").trim())
    .eq("tool_id", String(tool_id || "").trim())
    .single();

  return { data, error };
}

export async function getLatestToolBuild(tool_id: string) {
  const { data, error } = await supabase
    .from("tool_builds")
    .select("version, storage_path, is_active, is_latest, sha256, payload_type")
    .eq("tool_id", String(tool_id || "").trim())
    .eq("is_latest", true)
    .single();

  return { data, error };
}

export async function getAvailableToolsForPlan(
  plan_id: string
): Promise<AvailableToolItem[]> {
  const normalizedPlanId = String(plan_id || "").trim();

  const { data: planTools, error: planToolsErr } = await supabase
    .from("plan_tools")
    .select("tool_id, enabled")
    .eq("plan_id", normalizedPlanId)
    .eq("enabled", true);

  if (planToolsErr || !planTools?.length) {
    return [];
  }

  const toolIds = planTools
    .map((row) => String(row.tool_id || "").trim())
    .filter(Boolean);

  if (!toolIds.length) {
    return [];
  }

  const { data: tools, error: toolsErr } = await supabase
    .from("tools")
    .select("id, code, name, description, species, is_active")
    .in("id", toolIds)
    .eq("is_active", true);

  if (toolsErr || !tools?.length) {
    return [];
  }

  const { data: builds, error: buildsErr } = await supabase
    .from("tool_builds")
    .select("tool_id, version, is_active, is_latest")
    .in("tool_id", toolIds)
    .eq("is_latest", true)
    .eq("is_active", true);

  if (buildsErr || !builds?.length) {
    return [];
  }

  const latestBuildByToolId = new Map<string, { version: string }>();
  for (const build of builds) {
    latestBuildByToolId.set(String(build.tool_id), {
      version: String(build.version || ""),
    });
  }

  const out: AvailableToolItem[] = [];

  for (const tool of tools) {
    const build = latestBuildByToolId.get(String(tool.id));
    if (!build?.version) continue;

    out.push({
      code: String(tool.code || ""),
      name: String(tool.name || tool.code || ""),
      description: String(tool.description || ""),
      version: build.version,
      category: inferToolCategory(String(tool.code || ""), String(tool.name || "")),
      species: String(tool.species || "nepoznato"),
      badge: "Aktivno",
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "sr"));

  return out;
}

function inferToolCategory(code: string, name: string): string {
  const key = `${code} ${name}`.toLowerCase();

  if (key.includes("telenj") || key.includes("reprodukc")) {
    return "Reprodukcija";
  }

  if (
    key.includes("xlsx") ||
    key.includes("xls") ||
    key.includes("izvoz") ||
    key.includes("zbirni") ||
    key.includes("kontrol")
  ) {
    return "Izveštaji i izvoz";
  }

  return "Opšte";
}
