# Hackathon rules and release checklist

Verified against the organizers' public rules and the **authenticated participant guide and submission form inspected in Chrome on 29 October 2026**. This is a development checklist; the official contract and participant instructions govern participation. The inspection made no form changes, accepted no legal checkbox, and submitted nothing.

## Official sources

- [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
- [Full Official Rules and Event Waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver)
- [Authenticated participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
- [Official submission portal](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit)
- [Meta event page](https://dev.meta.ai/events/global-hackathon)

The full waiver was read from its public response data. Participant-only requirements below were subsequently verified in the user's authenticated Chrome session; they supersede earlier uncertainty from anonymous browsing.

## Published rules relevant to this build

The [Official Rules](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) require accepted participation, accurate information, age 18 plus local majority, and satisfaction of location, sanctions, employment, government-affiliation, and household exclusions. Participants build with Meta AI products.

Each participant and project enters one track. Indie teams have at most four people. Teams appoint an authorized representative who names members; startup representatives must be active employees. Members must agree to the rules.

Submissions must be original, owned work without rights violations. Technical assistance is allowed if ownership remains with the entrant. Open-source components are allowed when licenses are followed and the submission builds upon them. Entrants retain ownership but grant organizers broad perpetual usage rights. Materials receive no confidentiality protection. Recording/publicity consent, releases, indemnities, conduct requirements, and California jurisdiction also apply.

Selected participants receive $150 API credits for a ten-day window, subject to separate credit terms. Winners undergo verification, signed-rules and tax-document checks, and bear applicable taxes/fees. Organizers can modify the rules.

| Project judging criterion | Weight |
| --- | ---: |
| Impact | 30% |
| Use of Meta AI tooling | 25% |
| Technical depth and execution | 20% |
| Demo | 25% |

## Dates and project fit

The [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) specifies a **27 October–4 November 2026 build window**. The public event's 26 October date is the kickoff. This implementation was built on 29 October, within the stated window.

The [event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) lists submissions due **4 November 2026, 9:00 PM Eastern**. Its event metadata gives `2026-11-05T02:00:00Z`, which converts to **5 November 2026, 04:00 SAST / Africa/Johannesburg**. Treat that as a hard deadline and submit earlier. Judging runs 4-8 November; the closing ceremony is listed for 9 November. Organizers may change dates.

Our proposed theme is **Build for Your World**, because the audit-evidence workflow applies AI to a concrete operational problem. This is a project-fit recommendation, not confirmation of the participant's registered track.

## Verified participant and submission requirements

The [authenticated guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) requires a **public GitHub repository** and a **three-minute demo video**. The video must highlight only the specific features, code and functionality built during the hackathon, with original contributions clear; failure to distinguish them can disqualify an entry. New work is required. Startup entries may build on an existing product only when the new contribution is clearly identified. Do not present dependencies, the researched plan or any pre-existing product as newly built work.

The guide excludes basic RAG applications and simple image analyzers among its prohibited basic project categories. Vouch's intended contribution is the coordinated evidence workflow, independent reread, corroboration gates, review records and portable evidence export. Judges determine whether the submitted implementation satisfies the category rules.

**Stage 1 is pass/fail and requires actual use of Meta API or Meta open-weight models.** A fixture-only recording, installed adapter, configured model name or mocked provider test does not satisfy that requirement. The current build remains incomplete for this gate until a successful real model run is recorded.

For this event, the guide specifies Baseten model **`meta-models/muse-spark-open-1026`**. Use that event-specific identifier even though the general public cookbook shows a different slug.

The inspected submission form contains: Team Name; Team Members; track; problem/theme; optional X-post link for the viral award; Project Description; Public GitHub Repository; 3 Minute Demo Video; Describe use of Meta Products; Why Meta models were important; Feedback on Meta experience; Feedback on Partner Technologies; a legal permission checkbox for Meta/Cerebral Valley to publish, share and promote the submission; and Submit. The members control showed the user's **J de Beer** account. Registered roster and representative details still need the participant's confirmation. [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) prepares each field without inventing URLs, feedback or runtime results.

## Credits and billing instructions

The guide directs individuals to claim credits through its form; credits are processed in batches. Applying the credit to Meta billing requires a card and can involve a temporary preauthorization. A spend-limit notification is **not a guaranteed hard cap**. Monitor actual provider usage and billing. No credit claim, card entry, billing change or purchase was performed by the coding agent. The separately linked Credit Terms PDF remains unread because retrieval was blocked.

## Meta integration facts

The [Meta quickstart](https://dev.meta.ai/docs/quickstart) documents `https://api.meta.ai/v1`, `MODEL_API_KEY`, model `muse-spark-1.3`, and compatibility with the OpenAI SDK. An SDK's name does not establish which model provider is used; the configured URL and model do.

The [Chat Completions documentation](https://dev.meta.ai/docs/protocols/chat-completions) documents `/chat/completions`, `max_completion_tokens`, and response text at `choices[0].message.content`. Leave temperature unset unless there is a demonstrated reason to change it. The [structured-output guide](https://dev.meta.ai/docs/structured-output) documents `response_format` with a JSON schema; application-side validation is still needed for evidence accuracy.

## Outstanding verification

- **Meta credits/key:** pending, as stated by the user. Offline demonstrations must identify themselves as offline/rules-based. A configured adapter or mocked test is not proof that Meta inference ran. Preserve real request/model/usage metadata after the first successful live run.
- **Personal eligibility and declarations:** the authenticated participant area was accessible, but the user's age, eligibility declarations, final track/team roster, representative authorization and signed-waiver status still need personal confirmation.
- **Public repository and video:** requirements are verified. [The repository is public](https://github.com/Johan-de-Beer/vouch-audit-evidence-agent), with a successful fresh Ubuntu CI run. The recorded/uploaded three-minute video and hosted deployment remain pending.
- **Credit Terms PDF:** the waiver links to a signed Facebook CDN PDF. Automated retrieval returned HTTP 403, and the web reader could not open it. Read it in the participant's browser before claiming credits. Do not treat the published credit amount as confirmation that a balance is available.
- **Provider execution:** Meta/SAM/Baseten/voice access and live quality remain unverified until credentials are available. This blocks the actual-model-use gate.

## Final release checklist

- [ ] Participant confirms the outstanding account/eligibility items above.
- [x] Read authenticated participant instructions and inspect the submission form without submitting.
- [ ] Read linked credit terms and complete any credit/billing steps personally.
- [ ] Demonstrate a successful Meta-backed run once credits arrive; label offline runs accurately.
- [ ] Demonstrate source-linked findings, a contradictory/missing-evidence case, reviewer decisions, and export using synthetic material.
- [x] Publish the source in a public GitHub repository; public visibility and a fresh CI run were verified.
- [ ] Record and upload the required three-minute demo, showing only hackathon-built contributions and truthful measured results.
- [ ] Record dependencies and applicable licenses; remove secrets and private client evidence from submission assets.
- [ ] Verify the exact submitted build starts from the documented setup and is accessible to judges.
- [ ] Complete the actual portal fields, personally review the legal permission checkbox, and submit before the SAST deadline.

The application can be built and tested while these participant-dependent items remain open. It must not be described as fully submitted, fully eligible, or verified with live Meta inference until those facts are established.
