import { timingSafeEqual } from "node:crypto";
export class JobError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function automationScope() {
  const org = process.env.AIRS_AUTOMATION_ORG_ID;
  const device = process.env.AIRS_AUTOMATION_DEVICE_ID;
  if (process.env.AIRS_AUTOMATION_ENABLED !== "true" || !org || !device) throw new JobError("automation_disabled", 503);
  return { org, device };
}
export function requireController(req: Request) {
  automationScope();
  const expected = process.env.AIRS_AUTOMATION_CONTROL_TOKEN || "";
  const actual = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (expected.length < 32 || actual.length > 512 || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new JobError("unauthorized", 401);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== "https://chatgpt.com") throw new JobError("origin_denied", 403);
}
