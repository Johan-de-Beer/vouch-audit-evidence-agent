# Validation record

Verified on 29 October 2026. This record covers the software and the synthetic demonstration; it does not establish live Meta inference quality or hackathon eligibility.

- Local `npm run check`: 25 meaningful tests passed, production frontend compiled, deterministic fixture evaluation passed.
- [Fresh Ubuntu GitHub Actions run](https://github.com/Johan-de-Beer/vouch-audit-evidence-agent/actions/runs/40817108718): dependency installation, all tests, build and fixture evaluation passed from the public repository. The production Docker image also built and passed authentication/session checks, protected-file access and a complete synthetic run with valid hashes and seal.
- HTTP smoke test: 14 checks passed, including real PDF multipart import and rasterization, Host/Origin rejection, explicit missing-key handling, complete workflow, review/notes and every export format.
- Fixture results: 225/225 expected control results; all five planted scenarios found across six exception rows; zero false positives or unsupported matches within this fixture.
- All 475 source crops used by claims retain a simulated reread record. All 975 source/page/crop hashes, annotation hashes, result seal and event chain validated.
- ZIP evidence bundle: 981 entries, with a manifest mapping stored paths to archive entries. Every one of the 975 evidence file hashes was recomputed successfully.
- Detailed PDF: all pages retain sample identity, continuation context, headers and page numbers. Representative normal, continuation and transposition pages were rendered with Poppler and visually inspected.
- Desktop browser workflow: sample execution, exception filtering, source crop selection, human review and provider configuration were exercised in Chrome. At a true 390-pixel mobile viewport, the document's width remained 390 pixels with no horizontal overflow. [Desktop](screenshots/vouch-desktop.jpg) and [mobile](screenshots/vouch-mobile.jpg) screenshots retain the offline label. Temporary viewport overrides were cleared after testing.

Retained machine-readable evidence: [evaluation](validation/evaluation.json), [API smoke report](validation/api-smoke.json), [PDF inspection](validation/pdf-qa.json).

The independent reader's real transport is tested against a local mock. No Meta or Baseten key was supplied, no live inference was performed, and none of these numbers is a live model benchmark. The Baseten model default follows the authenticated hackathon guide's `meta-models/muse-spark-open-1026` requirement. Voice requires a supported WAV file and a real Meta key.

Run `npm run check` to repeat local checks. With the application running, use `npm run smoke` for the full HTTP/export probe. CI also runs `scripts/container-smoke.ts` against a token-protected Docker container. See [live validation](LIVE_VALIDATION.md) for the separate credential-dependent release gate.
