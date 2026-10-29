# Submission draft — Vouch

**Status: draft only; not submitted.** The actual authenticated [submission form](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit) and [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) were inspected in Chrome on **29 October 2026**, without edits or submission. Field headings below follow that form.

**The entry is not yet ready for the Stage 1 actual-Meta-use gate.** Credentials/live validation, a public GitHub repository and a recorded/uploaded three-minute video remain pending. Do not replace those gaps with fixture scores, mock responses or invented links. Complete [LIVE_VALIDATION.md](LIVE_VALIDATION.md), then update the runtime-related answers from observed results.

## Team Name

Suggested value: **Vouch**.

This is a proposed team name, not a claim that it has been saved in the portal.

## Team Members

The form showed the user's **J de Beer** account. Confirm the exact registered member selection and representative authorization. Add only actual participating people; no additional team members have been invented or selected by the coding agent.

## Track

Suggested value for a sole individual entry: **Indie Dev Track**. If this entry is instead made by an eligible startup, use the participant's actual **Startup Track** selection and authorized representative. Enter one track only. No track choice has been saved by the coding agent.

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

Live Meta/SAM/Baseten/voice adapters are implemented, but credentials and successful real inference remain pending. The fixture mode is explicitly labelled and never silently replaces a live run. This prototype supports auditor judgment, not an audit opinion, completeness testing or multi-tenant production use.

## Public GitHub Repository

**PENDING — an actual public GitHub repository must be published and its URL supplied.** The guide requires public visibility. No repository URL, publication or judge access is claimed by this draft. Include source, lockfile, setup instructions and applicable third-party notices; exclude secrets and private evidence. Verify the published revision reproduces the demo.

## 3 Minute Demo Video

**PENDING — record, upload and supply the actual three-minute video URL.** Three minutes is a verified requirement, not an estimated duration. The guide requires the video to highlight only specific features, code and functionality built during the 27 October–4 November hackathon, with original contribution clear. Failure to distinguish new work can disqualify the entry.

Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md) as the recording plan. Do not present the researched plan, third-party models/libraries/fonts or any pre-existing product as newly written code. Actual Meta API/open-weight execution still needs to be demonstrated honestly; an offline fixture-only recording cannot establish the Stage 1 model-use gate.

## Describe use of Meta Products

**Current truthful draft:**

The implementation contains adapters for Muse Spark 1.3 planning and structured field extraction from document pixels; SAM 3.1 streamed segmentation masks and crop bounds; Muse Spark Open on Baseten for a separate crop-only reread; and Muse Voice Transcribe for supported WAV auditor notes. The Baseten model is configured according to the event guide as **meta-models/muse-spark-open-1026**.

The verifier receives a source crop and requested field name without the ledger answer. Deterministic code performs arithmetic and comparisons. Missing, disputed or low-confidence evidence remains unverified for a reviewer. Offline fixture mode uses labelled known fields and simulated rereads and makes no provider calls.

**Runtime disclosure:** Meta credits/credentials are pending. No successful real Meta extraction, SAM segmentation, independent Baseten reread or voice transcription has been observed. This answer must be updated with actual run provenance after live validation before claiming the actual-use requirement is met.

## Why Meta models were important

**Design rationale; runtime benefits not yet measured:**

The workflow needs several distinct capabilities: a multimodal model to read document fields with locations, segmentation to isolate source regions, a separate open-weight reader to challenge those fields without seeing the expected ledger value, and speech-to-text for optional auditor notes. Meta's model family provides the intended components while deterministic code and explicit abstention keep the final control results reviewable. The contribution is their evidence-and-review coordination rather than a basic image analyzer or generic RAG interface.

No live quality, latency, cost or productivity advantage is claimed until measured. Successful runtime evidence is still needed for the hackathon's pass/fail Meta-use gate.

## Feedback on Meta experience

**Current truthful draft:**

We implemented against the published Meta API and SAM protocol documentation and exercised request/response handling with local mock contracts. We are still awaiting credits and have not completed real API calls. We therefore cannot yet provide feedback about live model performance, rate limits, billing behavior or reliability. After activation, we will validate a small synthetic sample, inspect masks/crop reads manually and record actual failures or limitations.

Do not substitute imagined praise, complaints or performance measurements for observed experience. Update this field after a real run if time permits.

## Feedback on Partner Technologies

**Current truthful draft:**

The project implements a Baseten client for the event's Muse Spark Open model identifier. We checked its documentation, including the lack of structured-output/JSON-mode support for this model, and validate requested JSON responses locally. The client contract has been tested with local mocks; Baseten credentials and real inference remain unvalidated. We cannot yet assess serving quality, latency, credit redemption or reliability from actual use.

Only add feedback on other partners if the participant actually used their products. No partner credits or service performance have been fabricated.

## Legal permission checkbox

**Leave unselected for the participant's personal review.** The form grants Meta/Cerebral Valley permission to publish, share and promote the submission. The coding agent has not accepted this permission, signed the waiver, made eligibility declarations or submitted the form. Review the linked official terms before selecting it.

## Submit

**NOT PRESSED.** Before submission: confirm personal eligibility/roster/track, complete actual-model validation, publish the public source repository, upload the required video, replace the pending fields with real URLs, and personally review all declarations and permissions.

The verified deadline is **5 November 2026, 04:00 SAST**. Recheck organizer updates and submit earlier. See [HACKATHON_RULES.md](HACKATHON_RULES.md) for verified requirements and the remaining checklist.

