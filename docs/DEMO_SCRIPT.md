# Required three-minute demo script

Required length: **three minutes**, verified in the [authenticated participant guide and submission form](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) inspected on 29 October 2026. The recording must highlight only specific features, code and functionality built during the **27 October–4 November** hackathon window, with original contributions clear. The implementation below was created on 29 October. Do not showcase an earlier product or claim third-party libraries as original work.

The timeline below is a **draft for the next video revision**. A bounded real Meta preflight has now succeeded on one fictional invoice: Spark extraction and one SAM total-region mask. Baseten independent reread, planning, voice, full-engagement operation, unreadable sources and planted cases remain untested live. Actual Meta execution is evidenced, but no organizer qualification decision or full submission readiness is claimed. Further provider calls are deferred to conserve credits. Keep the fixture workflow and this limited real preflight clearly distinguished.

Before recording, run `npm run check`, start the production server, and create a **Fresh demo** from the engagements menu. Close private tabs and keep API keys/access tokens out of the recording. The synthetic dataset must remain visibly labelled. Pre-run the sample once if recording latency would obscure the workflow, and say that results are already prepared.

| Time | Screen/action | Suggested narration |
| --- | --- | --- |
| 0:00–0:20 | Evidence workspace, ledger and original invoice | “I built Vouch during this hackathon on 29 October. My contribution is the evidence workflow connecting a ledger test to source crops, a separate reread, reviewer decisions and portable working papers. The models, fonts and libraries are third-party components.” |
| 0:20–0:40 | Point to Offline fixture mode; show the separate live preflight report | “The complete 25-row workflow uses labelled fixtures. Separately, two live Meta adapter invocations extracted one fictional invoice and segmented its total. That limited preflight worked; the independent reader and full live engagement remain untested.” |
| 0:40–1:05 | Filter Exceptions, select L003, open amount card and crop | “Here the ledger says 4,530, while the invoice shows 4,350. The amount result includes its source crop. I can open the original and inspect the highlighted region.” |
| 1:05–1:30 | Inspect L012 and L017; show duplicate rows | “The three-way quantity test finds ten units invoiced but eight received. Another source has no approval signature. Both duplicate postings are flagged. Five planted scenarios affect six rows.” |
| 1:30–1:50 | Review queue → Review; enter rationale; add typed note | “The agent preserves its result. The auditor adds a separate named conclusion and follow-up rationale. Typed notes become part of the working paper.” |
| 1:50–2:10 | Agent activity; expand one event; Evidence integrity | “The activity trail records the stages and links events by hash. Source and crop hashes can be recomputed. These are change-detection controls against a trusted retained copy, not proof that an invoice is genuine.” |
| 2:10–2:30 | Export working paper → Evidence bundle; show PDF/HTML | “The portable bundle includes original sources, crops, the working paper, structured results and the event trail. The evidence remains reviewable outside this interface.” |
| 2:30–2:50 | Retained live total crop and report; then Models & connections | “Here is the real Spark/SAM preflight crop: the complete TOTAL, ZAR 1,150.00. The report retains returned models and request references. Baseten credentials are absent; its crop-only reread, planning, voice and full live testing remain pending.” |
| 2:50–3:00 | Return to selected finding | “The useful output is an inspectable, reviewable chain from ledger line to source pixels. The fixture checks pass 225 controls; live quality and time savings still need to be measured.” |

Example human review rationale: “Confirmed the ledger/source discrepancy in the synthetic invoice. Request the corrected posting and retain both documents for follow-up.” Do not imply a real client audit was performed.

## Local screenshot rehearsal

A local offline rehearsal was prepared **before the successful Meta preflight** from eight actual application screenshots, with installed Windows speech narration and captions. It is a historical pre-key screenshot walkthrough, not a current status report or continuous screen recording. Its persistent banner says **OFFLINE SYNTHETIC REHEARSAL**. Earlier spoken statements that credentials/live execution are pending describe that capture's time and are superseded by the observed preflight. It is not the final submission video and has not been uploaded.

The generated assets are kept outside Git under `artifacts/demo-video/`: `vouch-offline-rehearsal.mp4`, `captions.srt`, `narration.wav`, a build manifest, representative frames, and the captured synthetic engagement/integrity context. The [storyboard](../scripts/demo-video-storyboard.json) defines the exact eight segments and narration. Its timing is 20/25/25/25/20/20/20/25 seconds, totaling three minutes.

To rebuild on Windows with installed `ffmpeg`, `ffprobe` and `System.Speech`, capture the real application views into `artifacts/demo-video/screens/` as `01-overview.png`, `02-transposition.png`, `03-quantity.png`, `04-review.png`, `05-trace.png`, `06-integrity.png`, `07-export.png`, and `08-models.png`. Then run:

```powershell
powershell.exe -NoProfile -File scripts/demo-video.ps1
```

`-PrepareOnly` generates narration and captions without rendering video. `-ScreensDirectory` and `-OutputDirectory` allow explicit local locations. The script never generates application screens or calls a provider. It records source/image/output hashes and checks for exactly 180 seconds and 5,400 frames. Captions use approximate timing aligned to measured local speech, with at most two lines. Inspect the output before any publication.

## Next recording revision

The existing [preflight report](validation/live-preflight.json), [source](validation/live-meta/fictional-invoice.png), [crop](validation/live-meta/total.png) and [mask](validation/live-meta/total.mask.svg) can be shown without making another provider request. Explain the limited one-source scope and that the full audit shown elsewhere uses fixtures. Replace the old pending-credentials narration before publishing. Only claim independent crop reread or full live operation after those specific tests actually succeed in a later deliberate validation session. Do not turn a fixture result into apparent live output.

## Details to keep accurate

- Five scenarios are amount transposition, VAT error, short delivery, missing approval, and a duplicate supplier invoice. The duplicate affects two rows. The VAT scenario fails both VAT and invoice/PO total checks, yielding seven exception findings across six rows.
- A confidence threshold of 0.8 is configured. It is not a calibrated probability of correctness.
- A Meta key worked for extraction/SAM; voice is implemented but still untested live. It accepts supported WAV files; there is no real-time microphone conversation.
- This build was implemented using Codex on 29 October 2026. Do not claim Muse Code was used.
- The Meta-only preflight took 13.133 seconds for two adapter invocations; actual HTTP attempt count is unproven because the SDK permits retries. Spark reported 4,016 tokens; SAM reported zero token counts, which do not establish zero cost. No measured audit time saving, general model-accuracy score, actual cost, deployment uptime or customer adoption is available.
- The local rehearsal is a historical draft. A revised final video, its uploaded URL, public application hosting and submission remain pending. Use the actual public repository URL and a real uploaded video URL. Keep the [release checklist](HACKATHON_RULES.md) open until its participant-dependent steps are done.
