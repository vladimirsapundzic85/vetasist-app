import { NextResponse } from "next/server";
import {
  resolveLicenseContext,
  registerOrCheckDevice
} from "@/app/lib/license-core";

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

    const context = await resolveLicenseContext(license_key);

    if (!context.ok) {
      return jsonResponse({ ok: false, reason: context.error }, 403);
    }

    const deviceResult = await registerOrCheckDevice({
      license_key,
      device_id,
      device_fp: device_id,
    });

    if (!deviceResult.ok) {
      return jsonResponse(
        {
          ok: false,
          reason: deviceResult.error,
          limit: deviceResult.limit ?? null,
          device_count: deviceResult.deviceCount ?? null,
        },
        403
      );
    }

    const tools = buildToolsManifest();

    return jsonResponse({
      ok: true,
      reason: "OK",
      plan: context.subscription.plan_id,
      valid_until: context.subscription.valid_until ?? null,
      device_limit: deviceResult.limit,
      device_new: deviceResult.isNewDevice,
      device_count: deviceResult.deviceCount,
      tools,
    });
  } catch (error) {
    console.error("license validate fatal error:", error);
    return jsonResponse({ ok: false, reason: "server_error" }, 500);
  }
}
