import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function deviceLimitForPlan(plan: string) {
  if (plan === "basic") return 1;
  if (plan === "team") return 3;
  if (plan === "pro") return 10;
  if (plan === "exclusive") return 30;
  return 1;
}

type ToolManifestItem = {
  code: string;
  name: string;
  description: string;
  version: string;
  category: string;
  species: string;
  badge?: string;
};

function buildToolsManifest(): ToolManifestItem[] {
  return [
    {
      code: "vb_zbirni_xlsx",
      name: "VB Zbirni XLSX",
      description:
        "HID lista → podaci o gazdinstvu i životinjama, zbirni Excel izvoz.",
      version: "1.0.1",
      category: "Izveštaji i izvoz",
      species: "goveda",
      badge: "Aktivno",
    },
    {
      code: "provera_telenja",
      name: "Provera telenja",
      description:
        "Provera datuma telenja kroz potomstvo, sa double-check logikom i Excel izvozom.",
      version: "2.10.6.2",
      category: "Reprodukcija",
      species: "goveda",
      badge: "Aktivno",
    },
  ];
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const { license_key, device_id } = await req.json();

    if (!license_key) {
      return jsonResponse({ ok: false, reason: "missing_license_key" }, 400);
    }

    if (!device_id) {
      return jsonResponse({ ok: false, reason: "missing_device_id" }, 400);
    }

    const now = new Date().toISOString();
    const device_fp = device_id;

    // 1) Nađi ključ i org_id
    const { data: lk, error: lkErr } = await supabase
      .from("license_keys")
      .select("org_id, is_active")
      .eq("license_key", license_key)
      .single();

    if (lkErr || !lk) {
      console.error("license lookup failed:", lkErr);
      return jsonResponse({ ok: false, reason: "license_key_not_found" }, 404);
    }

    if (!lk.is_active) {
      return jsonResponse({ ok: false, reason: "license_key_inactive" }, 403);
    }

    // 2) Nađi aktivnu pretplatu organizacije
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("status, plan_id, valid_until")
      .eq("org_id", lk.org_id)
      .single();

    if (subErr || !sub) {
      console.error("subscription lookup failed:", subErr);
      return jsonResponse({ ok: false, reason: "no_subscription" }, 404);
    }

    if (sub.status !== "active") {
      return jsonResponse({ ok: false, reason: "inactive_license" }, 403);
    }

    if (sub.valid_until && new Date(sub.valid_until) < new Date()) {
      return jsonResponse({ ok: false, reason: "expired" }, 403);
    }

    const limit = deviceLimitForPlan(sub.plan_id);

    // 3) Uzmi sve ključeve iste organizacije
    const { data: orgKeys, error: orgKeysErr } = await supabase
      .from("license_keys")
      .select("license_key")
      .eq("org_id", lk.org_id)
      .eq("is_active", true);

    if (orgKeysErr) {
      console.error("org keys lookup failed:", orgKeysErr);
      return jsonResponse({ ok: false, reason: "org_keys_lookup_failed" }, 500);
    }

    const orgLicenseKeys = (orgKeys ?? [])
      .map((row) => row.license_key)
      .filter(Boolean);

    if (!orgLicenseKeys.length) {
      return jsonResponse({ ok: false, reason: "no_active_org_keys" }, 404);
    }

    // 4) Uzmi sve uređaje za sve ključeve te organizacije
    const { data: orgDevices, error: orgDevicesErr } = await supabase
      .from("license_devices")
      .select("license_key, device_id")
      .in("license_key", orgLicenseKeys);

    if (orgDevicesErr) {
      console.error("org devices lookup failed:", orgDevicesErr);
      return jsonResponse(
        { ok: false, reason: "device_lookup_failed" },
        500
      );
    }

    // Jedinstveni uređaji na nivou organizacije
    const knownOrgDeviceIds = new Set(
      (orgDevices ?? []).map((row) => row.device_id).filter(Boolean)
    );

    const isKnownToOrg = knownOrgDeviceIds.has(device_id);
    const deviceCount = knownOrgDeviceIds.size;

    // 5) Ako je novi uređaj za organizaciju, proveri limit
    if (!isKnownToOrg && deviceCount >= limit) {
      return jsonResponse(
        {
          ok: false,
          reason: "device_limit_reached",
          limit,
          device_count: deviceCount,
        },
        403
      );
    }

    // 6) Da li ovaj konkretan ključ već ima zapis za taj uređaj?
    const { data: currentKeyDevice, error: currentKeyDeviceErr } = await supabase
      .from("license_devices")
      .select("license_key, device_id")
      .eq("license_key", license_key)
      .eq("device_id", device_id)
      .maybeSingle();

    if (currentKeyDeviceErr) {
      console.error("current key device lookup failed:", currentKeyDeviceErr);
      return jsonResponse(
        { ok: false, reason: "current_key_device_lookup_failed" },
        500
      );
    }

    const existsForCurrentKey = !!currentKeyDevice;

    // 7) Upis / heartbeat za konkretan ključ
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
        console.error("device insert failed:", insertErr);
        return jsonResponse(
          {
            ok: false,
            reason: "device_insert_failed",
            detail: insertErr.message ?? null,
            code: (insertErr as any).code ?? null,
            hint: (insertErr as any).hint ?? null,
          },
          500
        );
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
        console.error("device update failed:", updateErr);
        return jsonResponse(
          {
            ok: false,
            reason: "device_update_failed",
            detail: updateErr.message ?? null,
            code: (updateErr as any).code ?? null,
            hint: (updateErr as any).hint ?? null,
          },
          500
        );
      }
    }

    const tools = buildToolsManifest();

    return jsonResponse({
      ok: true,
      reason: "OK",
      plan: sub.plan_id,
      valid_until: sub.valid_until ?? null,
      device_limit: limit,
      device_new: !isKnownToOrg,
      device_count: !isKnownToOrg ? deviceCount + 1 : deviceCount,
      tools,
    });
  } catch (error) {
    console.error("license validate fatal error:", error);
    return jsonResponse({ ok: false, reason: "server_error" }, 500);
  }
}
