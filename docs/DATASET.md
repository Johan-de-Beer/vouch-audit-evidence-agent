# Synthetic source evidence

Run `npm run seed` to generate `data/demo/ledger.csv`, 75 source PDFs, matching source PNGs, six extra desk-photo JPEGs, a fixture manifest, and separate evaluation ground truth.

Every business, transaction and signature is fictional. There are no real addresses, tax registrations, bank accounts or personal details. The generator was written for this project; no public dataset or employer material is used.

The 25 ledger rows each have an invoice, purchase order and goods received note. Each PDF embeds the matching 1200 × 1600 PNG source page. The SVG layout uses the same coordinates as the extraction fixture, so exported evidence crops correspond exactly to source pixels. Desk-photo variants are separate upload examples and do not reuse the canonical extraction boxes.

Five planted scenarios affect six rows: L003 has a 4,530.00 ledger amount against a 4,350.00 invoice; L007 has VAT of 680.00 on a 4,800.00 net amount; L012 invoices 10 units but receives 8; L017 lacks an authorisation signature; L021 and L022 post the same supplier invoice twice.

Demo mode uses the labelled known-field fixture to exercise cropping, arithmetic, three-way matching, verification plumbing, exception handling, working papers and traceability without credentials. It does **not** run a vision model, SAM segmentation, a model-based blind reread, or voice transcription. Synthetic fixture evaluation must never be presented as live model accuracy.

`npm run eval` runs the engine with fixture fields, compares all 225 expected tests with observed claims, counts both the five scenarios and six exception claims, verifies that passing claims have crop references, rehashes every crop and rendered page, validates the event hash chain and completed-result seal, and writes `artifacts/evaluation.json`. Ground truth stays outside the engine input; it is used only after the run to score the outputs.
