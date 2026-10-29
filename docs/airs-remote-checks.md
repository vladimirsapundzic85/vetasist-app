# AIRS remote movement checks — pilot

Status: implementation for review. No production schema or configuration is changed by this branch. Retrieval success is not pedigree approval. The code does not compare seller/buyer or approve requests; it returns movement rows for that next step.

## Components

- `POST /api/automation/mcp`: stateless MCP JSON-RPC interface, two tools (create/get); bearer authentication. Only one operator/org/device is supported in this pilot.
- `POST /api/automation/worker`: extension claim/report; validates existing active license, organization, registered active device and plan access to the movement tool.
- SQL setup: `sql/airs-check-jobs.sql`. New server-only table, RLS enabled, all PUBLIC/anon/authenticated privileges revoked. No public policies, security-definer functions or new dependencies.
- Paired extension branch: `vladimirsapundzic85/vetassist-extension`, `feat/airs-remote-checks`. Requires test extension 1.0.14 and local movement tool 1.0.3.

## Before deployment

1. Review both PRs. Do not deploy just one component with remote intake enabled.
2. Validate the SQL in a separate database. It is a one-time setup, deliberately not `IF NOT EXISTS` and not automatically applied. Back up before a production setup. Project grants/Data API configuration must permit server-side service-role access to this table.
3. Deploy backend initially with `AIRS_AUTOMATION_ENABLED=false`. Existing license/tool routes are unchanged.
4. Set the following **server-only** environment values in the intended deployment; never place tokens in GitHub, the extension, NEXT_PUBLIC variables or chat:
   - `AIRS_AUTOMATION_ENABLED=true` (only after setup)
   - `AIRS_AUTOMATION_ORG_ID`: existing organization's ID from the license record
   - `AIRS_AUTOMATION_DEVICE_ID`: exact Device ID of the test extension (visible in its popup; a separately loaded test extension may have another ID/fingerprint)
   - `AIRS_AUTOMATION_CONTROL_TOKEN`: cryptographically random bearer token, minimum 32 characters; generate locally with `openssl rand -hex 32` or equivalent
   - Existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain required.
5. For a preview backend, replace the extension worker endpoint host with the actual preview host and add only that host to `host_permissions`. The committed worker points to the existing production host. Do not point preview code at production data accidentally.
6. Load the test extension in a separate Chrome profile, keep the stable extension disabled there, activate its license and register its Device ID. Open one logged-in AIRS tab, then turn on **GOO probne provere** in the popup. The toggle binds intake to that tab. No task is claimed while a manual tool is active or no logout/login evidence is visible. Close the test profile or switch intake off to stop it.
7. Connect an MCP client to the actual `/api/automation/mcp` URL with the bearer token through a supported secure credential field. This code does not implement OAuth discovery. Client acceptance of bearer-auth custom MCP servers and this stateless transport must be verified; adding the endpoint does not automatically add tools to an existing ChatGPT conversation. Never give ChatGPT the service-role key or AIRS credentials.

## Pilot flow and acceptance

Create a task through `create_airs_movement_check` with a new test `request_ref` and confirmed IDs (10 digits, optionally RS prefix). Limit: 20 animals. Use synthetic IDs for mock tests; use the four verified IDs from the GOO request only during the authorized live test. Read the returned `id` through `get_airs_movement_check` until terminal.

The server permits only the movement tool in all-movements mode, for the configured org/device. Request references are idempotent: the same reference with changed IDs fails. Only one queued/running job per paired device can exist (database unique index). Claim is a conditional queued-to-running UPDATE. No automatic requeue/retry of browser execution. A lost start response cannot start a second run.

The extension retains an outbox in extension storage until the server acknowledges. Duplicate identical reports are accepted; different replacements are rejected. Results must include every requested animal; warnings produce `needs_review`, not successful eligibility. A job deadline, tab closure, expired login or operator stop produces a failed retrieval. A queued job expires in 30 minutes; a claimed job in 15 minutes. Expiry is evaluated on subsequent requests. No background cleanup is scheduled. A permanently rejected report disables intake and retains the outbox for diagnosis; an operator must resolve this before re-enabling.

Test these in the real browser before accepting the feature:

1. Four animals: one job, all movements, result animal set exactly equals the input. Compare every row against the manual Excel export.
2. Wrong license/device/org/plan and missing controller token: rejected without returning job data.
3. Two simultaneous claim attempts: at most one receives the job.
4. Lost report HTTP response: same result retries, no duplicate AIRS run.
5. Logout, closed tab, navigation outside AIRS, stop toggle and 15-minute timeout: never completed.
6. Ordinary manual tool run: existing Excel download still works, remote run does not download a file.
7. Browser restart/extension reload mid-job: inspect the preserved job/outbox; never silently claim new work while unresolved.

## Verification performed locally

See tests in `tests/`: parser/result coverage checks and database isolation/claim constraints. Browser/worker mock tests live in the extension repository. Real AIRS parsing, Chrome lifecycle and MCP-client connection require the above live acceptance test. No live AIRS calls are made by unit tests.

## Disable and data handling

Set `AIRS_AUTOMATION_ENABLED=false` to reject controller and worker operations, and turn off browser intake. The table may contain holder names and HID movement history: keep it private, set an institutional retention period and remove results under that policy. Do not attach live result JSON to public PRs/issues. This pilot has no automatic retention job. It never transfers AIRS cookies or passwords to the backend.
