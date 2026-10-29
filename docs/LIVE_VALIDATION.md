# Live provider validation

**Current status: NOT RUN.** No Meta or Baseten credentials were supplied for this build. Offline fixture tests and mocked provider tests are useful engineering checks; neither proves a live provider integration worked.

The authenticated [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details), inspected on 29 October, makes actual Meta API or Meta open-weight use a Stage 1 pass/fail requirement. Live validation is therefore required before claiming submission readiness. The guide requires a public GitHub repository and a three-minute video showing only hackathon-built functionality; both publication artifacts remain pending.

Use this checklist after credits arrive. Start with fictional source documents. A model's name, an installed parser package, or a key-present badge is not execution evidence.

## Configure and restart

1. Keep the working `.env` private. Set `MODEL_API_KEY` and `BASETEN_API_KEY`; do not paste credentials into a note, CSV, recording or exported working paper.
2. Confirm access to the configured Meta models and the event-guide Baseten verifier **`meta-models/muse-spark-open-1026`**. The event-specific slug takes precedence over the general cookbook's `meta-models/muse-spark-open`. Entitlement is account-specific.
3. Restart the server so it reads the new environment. Open **Models & connections**. Both provider badges must show configured for a live evidence run.
4. Preserve the passing offline evaluation separately. Create a fresh engagement for live work; do not overwrite a fixture score with an unrelated live score.

Credit claiming is an individual form processed in batches. The guide says applying Meta credits requires a card and may involve a temporary preauthorization. Review the linked credit terms personally, and monitor actual usage: a spend-limit notification is not a guaranteed hard cap. No credit claim or billing action was performed during implementation.

The baseline Meta request uses `https://api.meta.ai/v1` and `muse-spark-1.3`, as documented in the [Meta quickstart](https://dev.meta.ai/docs/quickstart). Meta extraction uses JSON-schema output; see [structured output](https://dev.meta.ai/docs/structured-output). Baseten's [feature-support documentation](https://docs.baseten.co/inference/model-apis/overview#feature-support) explicitly excludes Muse Spark Open from structured outputs and JSON mode. Its reader must request JSON through the prompt, omit unsupported `response_format` options, and validate the returned text locally. Invalid output must remain unverified. Validate actual request compatibility rather than assuming SDK compatibility covers every model.

## Small smoke test

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

## Live validation record — fill from observed output

| Item | Observed result |
| --- | --- |
| Run date/time and timezone | NOT RUN |
| Source revision / archive identifier | NOT RECORDED |
| Environment and deployment URL (if any) | Local build; no hosted deployment performed |
| Engagement IDs and source set | NOT RUN |
| Meta model actually returned / request reference | NOT RUN |
| SAM model and usable mask count | NOT RUN |
| Baseten model and independent reread evidence | NOT RUN |
| Voice model / transcription result | NOT RUN |
| Request usage/cost from provider records | NOT MEASURED |
| End-to-end elapsed time | NOT MEASURED |
| Manually scored claims / exceptions / abstentions | NOT MEASURED |
| Crop correctness review | NOT RUN |
| Export / restart / integrity review | NOT RUN FOR LIVE OUTPUT |
| Failures, retries and unresolved gaps | Credentials pending |

Never replace these statuses with estimates. Provider token usage/cost is not currently persisted as a complete per-request billing ledger by the app; retain provider-side records separately if needed. Do not expose secret headers while collecting them.
