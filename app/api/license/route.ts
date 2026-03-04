import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { org_id, api_key } = await req.json();

    if (api_key !== process.env.VETASIST_SCRIPT_API_KEY) {
      return NextResponse.json({ ok: false, error: "invalid_api_key" });
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("org_id", org_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "no_subscription" });
    }

    if (data.status !== "active") {
      return NextResponse.json({ ok: false, error: "inactive_license" });
    }

    if (data.valid_until && new Date(data.valid_until) < new Date()) {
      return NextResponse.json({ ok: false, error: "expired" });
    }

    return NextResponse.json({
      ok: true,
      plan: data.plan_id
    });

  } catch (e) {
    return NextResponse.json({ ok: false, error: "server_error" });
  }
}
