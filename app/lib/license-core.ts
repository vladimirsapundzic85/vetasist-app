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
        | "device_upsert_failed"
        | "device_insert_failed"
        | "device_update_failed"
        | "current_key_device_lookup_failed"
        | "server_error";
      details?: string | null;
      limit?: number;
      deviceCount?: number;
    };

export function deviceLimitForPlan(plan: PlanId): number {
  if (plan === "basic") return 1;
  if (plan === "team") return 3;
  if (plan === "pro") return 10;
  if (plan === "exclusive") return 30;
  return 1;
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

export async function registerOrCheckDevice(params: {
  license_key: string;
  device_id: string;
  device_fp?: string | null;
}): Promise<DeviceRegistrationResult> {
  try {
    const license_key = String(params.license_key || "").trim();
    const device_id = String(params.device_id || "").trim();
    const device_fp = String(params.device_fp || device_id).trim();

    const context = await resolveLicenseContext(license_key);
    if (!context.ok) {
      return {
        ok: false,
        error: "server_error",
        details: `license_context_failed:${context.error}`,
      };
    }

    const planId = context.subscription.plan_id;
    const limit = deviceLimitForPlan(planId);

    const { data: devices, error: devErr } = await supabase
      .from("license_devices")
      .select("device_id")
      .eq("license_key", license_key);

    if (devErr) {
      return {
        ok: false,
        error: "device_lookup_failed",
        details: devErr.message ?? null,
      };
    }

    const known = new Set((devices ?? []).map((d) => String(d.device_id)));
    const isNewDevice = !known.has(device_id);

    if (isNewDevice && known.size >= limit) {
      return {
        ok: false,
        error: "device_limit_reached",
        limit,
        deviceCount: known.size,
      };
    }

    const now = new Date().toISOString();

    const { data: currentKeyDevice, error: currentKeyDeviceErr } = await supabase
      .from("license_devices")
      .select("license_key, device_id")
      .eq("license_key", license_key)
      .eq("device_id", device_id)
      .maybeSingle();

    if (currentKeyDeviceErr) {
      return {
        ok: false,
        error: "current_key_device_lookup_failed",
        details: currentKeyDeviceErr.message ?? null,
      };
    }

    const existsForCurrentKey = !!currentKeyDevice;

    if (!existsForCurrentKey) {
      const { error: insertErr } = await supabase
        .from("license_devices")
        .insert({
          license_key,
          device_id,
          device_fp,
          first_seen: now,
          last_seen: now,
        });

      if (insertErr) {
        return {
          ok: false,
          error: "device_insert_failed",
          details: insertErr.message ?? null,
        };
      }
    } else {
      const { error: updateErr } = await supabase
        .from("license_devices")
        .update({
          last_seen: now,
          device_fp,
        })
        .eq("license_key", license_key)
        .eq("device_id", device_id);

      if (updateErr) {
        return {
          ok: false,
          error: "device_update_failed",
          details: updateErr.message ?? null,
        };
      }
    }

    return {
      ok: true,
      limit,
      isNewDevice,
      deviceCount: isNewDevice ? known.size + 1 : known.size,
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
