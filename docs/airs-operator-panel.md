# AIRS operator panel

The panel at `/admin/airs-checks` lets a signed-in VetAssist administrator queue a read-only movement check and view/copy its result. It is an operator interface for Plus accounts; ChatGPT cannot call the custom MCP endpoint directly from a personal Plus account.

## Use

1. Sign in at `/app/auth` with the configured administrator account.
2. Keep the supported Chrome profile, the licensed test extension, and a logged-in AIRS tab open.
3. Enable **GOO probne provere** in the extension popup for that AIRS tab.
4. Open `/admin/airs-checks`, enter one ID per line, and start the check.
5. Wait for a terminal state. Copy the returned JSON into the review conversation.

The page polls the authenticated admin endpoint while a job is queued or running. The server still enforces the configured organization/device, license, active device, plan access, and the single active job constraint. The UI cannot choose tools, scripts, or URLs.

## Deployment prerequisites

This page must be deployed together with the AIRS job API/worker and the companion extension that targets the same deployed backend. The private jobs migration and server-only automation environment must already be configured. Do not put service-role keys, controller tokens, or AIRS credentials in the browser or extension. Do not enable the remote worker against production until the intended test device and data environment have been explicitly configured.
