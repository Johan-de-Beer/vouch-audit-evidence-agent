# Live provider validation

**Current status: LIMITED META PREFLIGHT PASSED; full live engagement not validated.** On 29 October 2026, a real Meta key completed one Muse Spark extraction and one SAM segmentation invocation on a newly generated fictional invoice. Baseten credentials are absent. Planning, independent reread, voice, unreadable-source handling, planted cases and the full engagement have not been tested live. Further provider calls are deferred to conserve credits.

The authenticated [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details), inspected on 29 October, makes actual Meta API or Meta open-weight use a Stage 1 pass/fail requirement. Real Meta execution is now evidenced within the limited scope below; no organizer qualification decision or full submission readiness is claimed. The required [public GitHub repository](https://github.com/Johan-de-Beer/vouch-audit-evidence-agent) is published. A local offline rehearsal exists; the final three-minute video and uploaded URL remain pending.

The participant reported receiving credits, and a Meta key subsequently worked for this preflight. Earlier observations of a disabled key-creation page are historical and no longer describe API availability. Current billing balance and actual charges remain unverified.

## Observed bounded preflight

The [report](validation/live-preflight.json) identifies run **6a32d87d-9f37-48b4-b9e5-16f17d9c797e**, from **2026-10-29 17:43:23.830 to 17:43:36.963 UTC** (**19:43 SAST**), elapsed **13.133 seconds**. It used one generated fictional invoice, not an uploaded client file or a fixture answer set.

- Spark returned **muse-spark-1.3** and 11 extracted fields. The total was **1,150.00**, agreeing with the printed source, with reported confidence **0.99**. This is one checked field, not an accuracy claim for all 11 fields. Usage was **2,067 input + 1,949 output = 4,016 tokens**.
- SAM returned **sam-3.1**, one total-region mask and reported confidence **0.92578125**. Its reported usage was **0/0/0**; those counts do **not** imply free inference or a known charge.
- The [retained crop](validation/live-meta/total.png) was visually checked to include the complete **TOTAL / ZAR 1,150.00**. The [source](validation/live-meta/fictional-invoice.png), crop and [mask](validation/live-meta/total.mask.svg) hashes were independently recomputed and agreed with the report.
- **Two adapter invocations** were recorded. Each SDK client permits one internal retry, yielding a configured maximum of four transport attempts across these invocations. The actual transport-attempt count is not established by the report.
- No Baseten call was made. There was no planning call, voice call, full engagement, unreadable-source case or planted-case live evaluation. Actual monetary cost is unknown.

The separate [post-run provenance record](validation/live-meta/run-context.json) verifies use of the official Meta endpoint and matches the runtime source files to revision `c8ebfb4f04a74dcb95956b53eafd0f4fc13809cb`. That source association was verified **after** the run; it was not automatically captured in the preflight report. The record also binds the report's SHA-256 hash and records the manual crop review. The restarted application's settings confirm Meta is configured and Baseten is not; key presence alone adds no execution evidence beyond this observed preflight.

## Configure and restart

1. Keep the working `.env` private. Set `MODEL_API_KEY` and `BASETEN_API_KEY`; do not paste credentials into a note, CSV, recording or exported working paper.
2. Confirm access to the configured Meta models and the event-guide Baseten verifier **`meta-models/muse-spark-open-1026`**. The event-specific slug takes precedence over the general cookbook's `meta-models/muse-spark-open`. Entitlement is account-specific.
3. Restart the server so it reads the new environment. Open **Models & connections**. Both provider badges must show configured for a live evidence run.
4. Preserve the passing offline evaluation separately. Create a fresh engagement for live work; do not overwrite a fixture score with an unrelated live score.

On Windows, `./configure.ps1 -Provider Meta` accepts the key in a hidden local prompt; `./configure.ps1` prompts for both providers. It does not create credentials, alter billing or make network calls. Blank input preserves the current value. Keep `.env` out of recordings.

Credit claiming is an individual form processed in batches. The guide says applying Meta credits requires a card and may involve a temporary preauthorization. Review the linked credit terms personally, and monitor actual usage: a spend-limit notification is not a guaranteed hard cap. No Meta credit claim or billing action was performed by the coding agent. The separate Baseten credit request was submitted with the participant's explicit acknowledgement/approval on 29 October; receipt was confirmed, but credits and API access have not been granted or verified.

The baseline Meta request uses `https://api.meta.ai/v1` and `muse-spark-1.3`, as documented in the [Meta quickstart](https://dev.meta.ai/docs/quickstart). Meta extraction uses JSON-schema output; see [structured output](https://dev.meta.ai/docs/structured-output). Baseten's [feature-support documentation](https://docs.baseten.co/inference/model-apis/overview#feature-support) explicitly excludes Muse Spark Open from structured outputs and JSON mode. Its reader must request JSON through the prompt, omit unsupported `response_format` options, and validate the returned text locally. Invalid output must remain unverified. Validate actual request compatibility rather than assuming SDK compatibility covers every model.

## Future validation steps — deferred to conserve credits

The Meta-only preflight above is already complete; do not rerun it merely to regenerate this record. In a later deliberate validation session, add Baseten and run `npm run live:preflight` to include a crop-only second read. Retain the new report and source/mask/crop files separately. Success remains limited to the calls and source actually tested. Each invocation makes real requests and can consume credits.

Generate bounded import packs with `npm run samples:live`. Under `artifacts/live-samples/`, use the clean sample first, then the isolated amount, VAT, short-delivery, missing-approval and paired-duplicate packs. Upload only a pack's input CSV and PDFs. Expected findings are stored separately for manual scoring and must never enter extraction or verification prompts.

Import one synthetic ledger row with its invoice, PO and GRN from `data/demo`, using the downloaded CSV template to make a one-row ledger. Choose a non-exception row first. Uploaded documents are stored as a live engagement; use filenames that preserve their invoice/PO/GRN roles. Select **Live Meta + Baseten API** and run checks.

Record the actual stage output. Confirm:

- Muse Spark returns a validated plan and fields read from source images. Values must not come from `fixture.json` or `ground-truth.json`.
- Extraction bounds are in source pixel coordinates and include the complete visible value.
- SAM returns usable masks and boxes with matching object IDs. Inspect overlays on the original page. A rectangle fallback must not be described as successful segmentation.
- The verifier receives an individual crop and field name without the ledger value or first reader's proposed answer. Compare the returned value to the visible crop manually.
- Arithmetic and three-way matching use the extracted evidence and produce a source-linked claim.
- A successful match requires adequate corroboration. Missing masks, low confidence, absent evidence or unresolved disagreement remain unverified.
- The trace identifies real models where called. There is no fixture simulation label or synthetic answer substitution in the live branch.

The engine limits extraction/re-extraction to two attempts per document and allows a fresh reread for uncertain/disagreeing crop evidence. Inspect those paths with controlled invalid/uncertain synthetic inputs. Do not spend a full credit balance on a first 75-document run.

## Exception and abstention checks

After the first row succeeds, test each planted scenario separately: L003 amount, L007 VAT, L012 short delivery, L017 missing approval, and L021/L022 duplicate postings. Include both duplicate ledger rows in that test. Keep manually reviewed expected outcomes outside the model inputs. Scores from live output must be labelled with the exact source set, model IDs, run date and scoring method.

Also test one missing supporting document, an unreadable/obscured crop, an invalid key, an unavailable model and a provider failure. Expected behavior is an explicit error or an unverified claim, without a fabricated match or silent transition to offline mode. A rejected live start when either key is missing is expected behavior.

Before claiming a confidence percentage predicts correctness, build a separate calibration study. The current 0.8 threshold is an engineering review gate. Before claiming productivity improvement, run a timed human baseline against comparable samples.

## Voice check

The current voice path accepts uploaded **mono, 16-bit PCM WAV at 16 or 24 kHz**, under ten minutes and within the 20 MB route upload limit. It sends multipart data to the configured Meta `/asr/transcribe` route. Use a brief fictional note, inspect its returned transcript and optional timed turns, save it to the intended sample line, and verify the exported paper includes it. No real-time microphone experience is implemented.

## Export and restart checks

Download PDF, standalone HTML, JSON, JSONL and ZIP after a successful live run. Open the papers and confirm crops, model labels, findings, human review and notes agree with the UI. Recompute file/event integrity. Save a trusted copy before modifying evidence. Restart the server and confirm the completed engagement remains available. A run interrupted by restart should be marked failed with an explanation, then rerun deliberately.

## Live validation record

| Item | Observed result |
| --- | --- |
| Run date/time and timezone | 29 October 2026, 17:43:23.830–17:43:36.963 UTC / 19:43 SAST |
| Source revision / archive identifier | Preflight 6a32d87d-9f37-48b4-b9e5-16f17d9c797e; [post-run source match](validation/live-meta/run-context.json) to c8ebfb4f04a74dcb95956b53eafd0f4fc13809cb, verified after execution |
| Environment and deployment URL (if any) | Local build; no hosted deployment performed |
| Engagement IDs and source set | One generated fictional invoice; no engagement was created or analysed |
| Meta model actually returned / request reference | muse-spark-1.3; response chatcmpl-01a188c2-912a-71c9-b143-1f5ecc1a79f3; request d04e0dfb-6da4-4eb8-ad58-8e3482fa482c |
| SAM model and usable mask count | sam-3.1; one mask; response resp_6ae385c8e68cded290df48be; request 4edd3036-0bde-4550-bfdc-268dd637a488 |
| Baseten model and independent reread evidence | NOT RUN; key absent |
| Voice model / transcription result | NOT RUN LIVE |
| Reported usage / actual cost | Spark 2,067 input / 1,949 output; SAM 0/0/0 reported; actual cost unknown |
| Preflight elapsed time / full engagement runtime | 13.133 seconds / NOT MEASURED |
| Manually scored claims / exceptions / abstentions | No audit claims or planted-case scores produced |
| Crop correctness review | Complete TOTAL / ZAR 1,150.00 visually confirmed; three retained file hashes independently validated |
| Export / restart / integrity review | NOT RUN FOR LIVE OUTPUT |
| Failures, retries and unresolved gaps | Two adapter invocations; actual transport attempts unproven; Baseten key absent; remaining live coverage deferred |

Never replace these statuses with estimates. Successful and failed provider SDK invocations retain allowlisted execution metadata in hash-chained events and the preflight report: requested/returned model, request/response references, duration, status and token counts when supplied. Missing metadata remains absent. Streaming SAM metadata is captured only when the provider emits it. The SDK may retry internally, and token counts do not establish actual charges; retain provider-side billing records separately. Prompts, raw provider responses, headers and credentials are excluded from this metadata.
