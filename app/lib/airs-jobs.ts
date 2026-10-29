import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createSupabaseAdminClient } from "./admin-auth";
import { resolveLicenseContext, getToolByCode, getPlanToolAccess } from "./license-core";
import { parseJobInput, parseJobResult, TOOL } from "./airs-job-validation";
import { automationScope, JobError } from "./airs-job-auth";
export { JobError, requireController } from "./airs-job-auth";

const PUBLIC_FIELDS = "id,request_ref,animal_ids,tool_code,status,created_at,started_at,finished_at,expires_at,error,result";
async function workerScope(body: Record<string, unknown>) {
  const scope = automationScope();
  const key = body.license_key, device = body.device_id, fp = body.device_fp;
  if (typeof key !== "string" || key.length > 256 || device !== scope.device || typeof fp !== "string" || fp.length > 256) throw new JobError("worker_denied", 403);
  const context = await resolveLicenseContext(key);
  if (!context.ok || context.org_id !== scope.org) throw new JobError("worker_denied", 403);
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("license_devices").select("status,blocked_until").eq("license_key", key).eq("device_id", device).eq("device_fp", fp).eq("status", "active").maybeSingle();
  if (error) throw new JobError("device_lookup_failed", 503);
  if (!data || (data.blocked_until && new Date(data.blocked_until).getTime() > Date.now())) throw new JobError("worker_denied", 403);
  const tool = await getToolByCode(TOOL);
  if (tool.error || !tool.data?.is_active) throw new JobError("tool_denied", 403);
  const access = await getPlanToolAccess(context.subscription.plan_id, tool.data.id);
  if (access.error || !access.data?.enabled) throw new JobError("tool_denied", 403);
  return scope;
}
async function expireJobs() {
  const scope = automationScope(), db = createSupabaseAdminClient();
  const { error } = await db.from("airs_check_jobs").update({ status: "failed", error: "deadline_exceeded", finished_at: new Date().toISOString() }).eq("org_id", scope.org).eq("device_id", scope.device).in("status", ["queued", "running"]).lt("expires_at", new Date().toISOString());
  if (error) throw new JobError("job_store_unavailable", 503);
}
export async function createJob(input: unknown) {
  const scope = automationScope();
  let parsed;
  try { parsed = parseJobInput(input); } catch (e) { throw new JobError((e as Error).message); }
  await expireJobs();
  const db = createSupabaseAdminClient();
  const old = await db.from("airs_check_jobs").select(PUBLIC_FIELDS).eq("org_id", scope.org).eq("request_ref", parsed.request_ref).maybeSingle();
  if (old.error) throw new JobError("job_store_unavailable", 503);
  if (old.data) {
    if (JSON.stringify(old.data.animal_ids) !== JSON.stringify(parsed.animal_ids)) throw new JobError("request_ref_conflict", 409);
    return old.data;
  }
  const { data, error } = await db.from("airs_check_jobs").insert({ org_id: scope.org, device_id: scope.device, ...parsed, tool_code: TOOL, expires_at: new Date(Date.now() + 30 * 60000).toISOString() }).select(PUBLIC_FIELDS).single();
  if (error) throw new JobError(error.code === "23505" ? "job_already_exists_or_device_busy" : "job_store_unavailable", error.code === "23505" ? 409 : 503);
  return data;
}
export async function getJob(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new JobError("invalid_job_id");
  await expireJobs();
  const { data, error } = await createSupabaseAdminClient().from("airs_check_jobs").select(PUBLIC_FIELDS).eq("org_id", automationScope().org).eq("id", id).maybeSingle();
  if (error) throw new JobError("job_store_unavailable", 503);
  if (!data) throw new JobError("job_not_found", 404);
  return data;
}
export async function workerAction(body: Record<string, unknown>) {
  const scope = await workerScope(body), db = createSupabaseAdminClient();
  await expireJobs();
  if (body.action === "claim") {
    const next = await db.from("airs_check_jobs").select("id,animal_ids,request_ref,tool_code").eq("org_id", scope.org).eq("device_id", scope.device).eq("status", "queued").order("created_at").limit(1).maybeSingle();
    if (next.error) throw new JobError("job_store_unavailable", 503);
    if (!next.data) return { job: null };
    const claim_token = randomUUID();
    const { data, error } = await db.from("airs_check_jobs").update({ status: "running", claim_token, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60000).toISOString() }).eq("id", next.data.id).eq("status", "queued").select("id,animal_ids,request_ref,tool_code,claim_token,expires_at").maybeSingle();
    if (error) throw new JobError("claim_failed", 503);
    return { job: data ? { ...data, reportMode: "all" } : null };
  }
  if (body.action !== "report") throw new JobError("unknown_worker_action");
  if (typeof body.job_id !== "string" || typeof body.claim_token !== "string") throw new JobError("invalid_claim");
  const found = await db.from("airs_check_jobs").select("id,animal_ids,status,result,error").eq("id", body.job_id).eq("org_id", scope.org).eq("device_id", scope.device).eq("claim_token", body.claim_token).maybeSingle();
  if (found.error) throw new JobError("job_store_unavailable", 503);
  if (!found.data) throw new JobError("claim_not_found", 404);
  let parsed;
  try { parsed = parseJobResult(body, found.data.animal_ids); } catch (e) { throw new JobError((e as Error).message); }
  // A lost HTTP response can be retried, but cannot replace a previously accepted result.
  if (found.data.status !== "running") {
    if (found.data.status === parsed.status && found.data.error === parsed.error && isDeepStrictEqual(found.data.result, parsed.result)) return { accepted: true };
    throw new JobError("job_not_running", 409);
  }
  const done = await db.from("airs_check_jobs").update({ ...parsed, finished_at: new Date().toISOString() }).eq("id", found.data.id).eq("claim_token", body.claim_token).eq("status", "running").select("id").maybeSingle();
  if (done.error || !done.data) throw new JobError("report_conflict", 409);
  return { accepted: true };
}
