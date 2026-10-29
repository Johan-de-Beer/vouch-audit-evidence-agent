# Submission draft — Vouch

**Status: draft only; not submitted.** The actual authenticated [submission form](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit) and [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) were inspected in Chrome on **29 October 2026**, without edits or submission. Field headings below follow that form.

**The entry is not fully submission-ready.** The public repository is published, and a [bounded real Meta preflight](validation/live-preflight.json) now evidences extraction and segmentation on one fictional invoice. No organizer Stage 1 decision is claimed. Baseten credentials, remaining live validation and the final uploaded three-minute video remain pending. Answers below distinguish this observed preflight from the offline fixture workflow.

## Team Name

Suggested value: **Vouch**.

This is a proposed team name, not a claim that it has been saved in the portal.

## Team Members

The form showed **Johan de Beer** (`JohandeBeer`). Confirm the registered member selection and representative authorization. Add only actual participating people; no additional team members have been invented or selected by the coding agent.

## Track

The participant's saved Cerebral Valley application was inspected on 29 October and says **Indie Dev Track**. The Baseten credits request uses the matching **Indie** option. The final hackathon submission's track has not been edited or submitted by the coding agent; keep it consistent with the participant's actual registration and any permitted changes.

## Problem / theme

Suggested value: **Build for Your World**.

The alternative **Push the Frontier** was visible. Vouch applies AI to a concrete purchases-evidence workflow, so the first theme fits the current implementation. No theme choice has been saved.

## X-post link — optional viral-award field

**Leave blank unless the participant supplies an actual qualifying post URL.** No X post has been created or published. This field is optional; do not invent a link or imply social traction.

## Project Description

**Vouch — Every claim, backed by pixels.**

Vouch helps an auditor review a purchases ledger sample against invoices, purchase orders and goods received notes. The contribution built during this hackathon on 29 October 2026 is the coordinated evidence workflow: source ingestion and rendering, inspectable crop-linked controls, corroboration gates, bounded retries, human review records, event/file integrity checks, and portable working-paper exports.

The React/Express application persists engagements in SQLite. Its UI includes a ledger, source overlays, evidence cards, review queue, typed notes and an agent activity trail. PDF/HTML working papers and a ZIP bundle retain sources, crops and structured results for review outside the app. The intended benefit is less document navigation and easier review; no measured time saving or customer adoption is claimed.

A fictional dataset supplies 25 ledger rows and 75 source documents. The deterministic fixture evaluation passes 225 expected controls and finds five planted scenarios affecting six exception rows. These are pipeline checks using known extraction fields, not model-accuracy results.

Live Meta/SAM/Baseten/voice adapters are implemented. A limited Meta-only preflight successfully extracted one fictional invoice and segmented its total; independent Baseten reread, voice, planning and full-engagement execution remain untested live. Fixture mode is explicitly labelled and never silently replaces a live run. This prototype supports auditor judgment, not an audit opinion, completeness testing or multi-tenant production use.

## Public GitHub Repository

https://github.com/Johan-de-Beer/vouch-audit-evidence-agent

Published publicly with source, lockfile, setup instructions, MIT license for original code and third-party notices. API keys and runtime evidence directories are excluded. A fresh Ubuntu GitHub Actions run reproduced tests, build and fixture evaluation successfully. Verify the final recording matches the submitted revision.

## 3 Minute Demo Video

**PENDING — finalize the live-validated video, upload it and supply the actual three-minute video URL.** A captioned three-minute local offline screenshot rehearsal is available under `artifacts/demo-video/`; it is explicitly a draft, makes no live-inference claim, and has not been uploaded. Three minutes is a verified requirement, not an estimated duration. The guide requires the video to highlight only specific features, code and functionality built during the 27 October–4 November hackathon, with original contribution clear. Failure to distinguish new work can disqualify the entry.

Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md) as the recording plan. Do not present the researched plan, third-party models/libraries/fonts or any pre-existing product as newly written code. The final video can include the retained actual Meta extraction/SAM evidence, with its limited scope explicit. The existing pre-key offline screenshot rehearsal is historical and must not be presented as a current live demonstration or as proof of the full workflow.

## Describe use of Meta Products

**Current truthful draft:**

The implementation contains adapters for Muse Spark 1.3 planning and structured field extraction from document pixels; SAM 3.1 streamed segmentation masks and crop bounds; Muse Spark Open on Baseten for a separate crop-only reread; and Muse Voice Transcribe for supported WAV auditor notes. The Baseten model is configured according to the event guide as **meta-models/muse-spark-open-1026**.

The verifier receives a source crop and requested field name without the ledger answer. Deterministic code performs arithmetic and comparisons. Missing, disputed or low-confidence evidence remains unverified for a reviewer. Offline fixture mode uses labelled known fields and simulated rereads and makes no provider calls.

**Observed runtime disclosure:** on 29 October 2026 at 19:43 SAST, a Meta-only preflight completed in 13.133 seconds. Spark returned `muse-spark-1.3` and 11 fields; its total 1,150.00 agreed with the fictional invoice, with confidence 0.99. SAM returned `sam-3.1`, one total-region mask and confidence 0.92578125. The complete TOTAL / ZAR 1,150.00 crop was visually confirmed and three source/crop/mask hashes independently validated. This records two adapter invocations; actual transport-attempt count is unproven because the SDK permits internal retries. Baseten, voice, planning, planted cases, unreadable sources and the full engagement were not tested live. Further calls are deferred to conserve credits.

## Why Meta models were important

**Design rationale; runtime benefits not yet measured:**

The workflow needs several distinct capabilities: a multimodal model to read document fields with locations, segmentation to isolate source regions, a separate open-weight reader to challenge those fields without seeing the expected ledger value, and speech-to-text for optional auditor notes. Meta's model family provides the intended components while deterministic code and explicit abstention keep the final control results reviewable. The contribution is their evidence-and-review coordination rather than a basic image analyzer or generic RAG interface.

The bounded preflight demonstrates that the extraction and segmentation adapters can produce reviewable source evidence on this one invoice. It does not demonstrate general model quality, a latency/cost advantage, independent verification or productivity improvement. Actual Meta execution evidence is retained; organizer qualification and full submission readiness are not claimed.

## Feedback on Meta experience

**Current truthful draft:**

We implemented against the published Meta API and SAM protocol documentation and exercised request/response handling with local mocks. A bounded real preflight then completed one extraction and one segmentation invocation successfully in 13.133 seconds on a fictional invoice. It returned the expected total and a usable mask/crop. Spark reported 2,067 input plus 1,949 output tokens; SAM reported zero token counts, which do not establish zero cost. Actual charges and billing balance are unknown. This single-source check is insufficient to judge general quality, reliability, rate limits or comparative speed; further calls are deferred to conserve credits.

Do not substitute imagined praise, complaints or performance measurements for observed experience. Update this field after a real run if time permits.

## Feedback on Partner Technologies

**Current truthful draft:**

The project implements a Baseten client for the event's Muse Spark Open model identifier. We checked its documentation, including the lack of structured-output/JSON-mode support for this model, and validate requested JSON responses locally. The client contract has been tested with local mocks; Baseten credentials and real inference remain unvalidated. We cannot yet assess serving quality, latency, credit redemption or reliability from actual use.

Only add feedback on other partners if the participant actually used their products. No partner credits or service performance have been fabricated.

## Legal permission checkbox

**Leave unselected for the participant's personal review.** The form grants Meta/Cerebral Valley permission to publish, share and promote the submission. The coding agent has not accepted this permission, signed the waiver, made eligibility declarations or submitted the form. Review the linked official terms before selecting it.

## Submit

**NOT PRESSED.** Before submission: confirm personal eligibility/roster/track, complete actual-model validation, verify the public source revision, upload the required video, replace the pending fields with real URLs, and personally review all declarations and permissions.

The verified deadline is **5 November 2026, 04:00 SAST**. Recheck organizer updates and submit earlier. See [HACKATHON_RULES.md](HACKATHON_RULES.md) for verified requirements and the remaining checklist.

