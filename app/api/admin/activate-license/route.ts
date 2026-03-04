import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { api_key, org_id, plan_id, valid_until } = await req.json();

    // simple admin auth
    if (api_key !== process.env.VETASIST_SCRIPT_API_KEY) {
      return NextResponse.json({ ok: false, error: "invalid_api_key" }, { status: 401 });
    }

    if (!org_id || !plan_id) {
      return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
    }

    const payload: any = {
      org_id,
      plan_id,
      status: "active",
      valid_until: valid_until ?? null,
      updated_at: new Date().toISOString(),
    };

    // upsert subscription row
    const { data, error } = await supabase
      .from("subscriptions")
      .upsert(payload, { onConflict: "org_id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, subscription: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
