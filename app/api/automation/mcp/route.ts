import { NextResponse } from "next/server";
import { createJob, getJob, JobError, requireController } from "@/app/lib/airs-jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const tools = [
  { name: "create_airs_movement_check", description: "Queue a read-only AIRS movement check on the paired, opted-in VetAssist browser. No AIRS writes. request_ref is an idempotency key; use a new reference for a fresh check.", inputSchema: { type: "object", properties: { request_ref: { type: "string", maxLength: 120 }, animal_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 } }, required: ["request_ref", "animal_ids"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
  { name: "get_airs_movement_check", description: "Read job status and movement rows. completed means retrieval completed, not approval of the pedigree request. needs_review contains warnings; failed never means the animal is ineligible.", inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
];
export async function POST(req: Request) {
  let id: unknown = null;
  try {
    requireController(req);
    const text = await req.text();
    if (Buffer.byteLength(text) > 16000) throw new JobError("payload_too_large", 413);
    const b = JSON.parse(text);
    if (!b || Array.isArray(b) || b.jsonrpc !== "2.0" || typeof b.method !== "string") throw new JobError("invalid_rpc");
    id = b.id ?? null;
    if (b.method.startsWith("notifications/") && b.id === undefined) return new NextResponse(null, { status: 202 });
    let result;
    if (b.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "vetassist-airs", version: "0.1.0" } };
    else if (b.method === "ping") result = {};
    else if (b.method === "tools/list") result = { tools };
    else if (b.method === "tools/call") {
      try {
        const args = b.params?.arguments || {};
        const value = b.params?.name === tools[0].name ? await createJob(args) : b.params?.name === tools[1].name ? await getJob(args.job_id) : (() => { throw new JobError("unknown_tool"); })();
        result = { content: [{ type: "text", text: JSON.stringify(value) }], isError: false };
      } catch (e) { result = { content: [{ type: "text", text: e instanceof JobError ? e.message : "job_request_failed" }], isError: true }; }
    } else return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32000, message: e instanceof JobError ? e.message : "invalid_request" } }, { status: e instanceof JobError ? e.status : 400, headers: { "Cache-Control": "no-store" } });
  }
}
// This pilot uses stateless JSON responses; no SSE stream or server-side session.
export function GET() { return new NextResponse(null, { status: 405, headers: { Allow: "POST" } }); }
