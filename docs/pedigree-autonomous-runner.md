# Autonomous pedigree review — local runner

## Goal

Run a local Windows process that watches the Google Form response sheet, retrieves newly submitted attachments, builds a review case, checks the annual register and Smotra data, queues the AIRS movement lookup through the paired browser worker, and stores one evidence-based report for the operator. The process reports discrepancies and missing evidence; it never approves a pedigree or writes to AIRS.

## Existing pieces

- `app/lib/airs-case-validation.ts` contains the current deterministic checks for identity, Smotra, AIRS ownership transfers, parity/lactation counts, missing lactation numbers, and production thresholds.
- `app/api/automation/mcp` and `app/api/automation/worker` provide the gated AIRS job flow. The licensed extension must be open on a signed-in AIRS tab with **GOO probne provere** enabled.
- `app/lib/pedigree-form-intake.ts` maps the known response-sheet headers to stable request fields, extracts Drive attachment IDs, and leaves zero-animal or missing-attachment cases visible for review.

## Intake mapping

The form response sheet currently has Serbian Cyrillic headers for office number, submission time, contact email, organization, request type, urgency, breeding program, declared animal count, seller, buyer, and attachment links. Intake locates columns by their normalized header names, so extra/reordered columns do not silently shift values. It retains the source response row number as a fallback identifier.

The attachment cell may contain multiple Drive links. File metadata and document contents must be fetched separately. A declared count of zero, malformed count, or absent attachment link is a review finding rather than a dropped submission.

## Required local configuration before live polling

1. The ID of the Google Sheet linked to the pedigree request form.
2. Read-only Google Drive/Sheets authorization for the Windows user running the app. OAuth client configuration and refresh tokens stay on that machine and are excluded from Git.
3. IDs or local sync locations for the annual RT register folders and Smotra source folder, with the relevant years selected by the request.
4. The paired local VetAssist backend/Supabase configuration and the test extension already used in the pilot.

The connected Google Drive account in ChatGPT cannot be reused by a Windows process. Google requires an application OAuth client and user consent for local installed apps; offline access is what permits background refresh without asking for a login on each poll. Use read-only scopes only. Never paste OAuth client secrets, refresh tokens, Supabase service-role keys, or AIRS credentials into chat or commit them.

## Runtime limits and review behavior

- Local polling runs only while the Windows user session and runner are running. A scheduled task can start it at user login after the first successful interactive Google authorization.
- AIRS retrieval pauses if the AIRS tab closes, the operator turns off intake, or the login expires. It resumes only after the browser is ready again; failures remain explicit in the case report.
- For RS animals, identity comes from the matching annual Serbian register, except when the attached pedigree is from the Zemun Institute. Foreign-ID animals use the attached pedigree.
- The report keeps source file names/links and field-level expected/actual values so an operator can check each finding against its source.
- OCR-extracted values and layout-dependent spreadsheet cells require confidence checks; uncertain extraction is marked `needs_data`, never treated as a match.
