import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { tool_slug } = body

    if (!tool_slug) {
      return NextResponse.json({ error: "missing tool_slug" }, { status: 400 })
    }

    const { data: tool } = await supabase
      .from("tools")
      .select("id, slug")
      .eq("slug", tool_slug)
      .single()

    if (!tool) {
      return NextResponse.json({ error: "tool_not_found" }, { status: 404 })
    }

    const { data: build } = await supabase
      .from("tool_builds")
      .select("storage_path")
      .eq("tool_id", tool.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (!build) {
      return NextResponse.json({ error: "build_not_found" }, { status: 404 })
    }

    const { data: signed } = await supabase.storage
      .from("Tools")
      .createSignedUrl(build.storage_path, 60)

    if (!signed) {
      return NextResponse.json({ error: "signed_url_failed" }, { status: 500 })
    }

    return NextResponse.json({
      script_url: signed.signedUrl
    })

  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
