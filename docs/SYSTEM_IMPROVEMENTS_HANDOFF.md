# Agora system improvements: implementation handoff

Date: October 1, 2026.

## Objective

Improve the existing campus food finder’s evidence coverage, classification presentation, explainability, and scan efficiency. Preserve the existing UI patterns and the Electron main/preload/renderer boundary. Keep TypeSafe Jev as the classifier.

This document records the already implemented baseline and the proposed next changes. The proposed changes below have **not** been implemented. Read the current repository instructions before starting, and inspect the working tree: previous changes may still be uncommitted. Preserve them.

## Observed baseline

The September 30 desktop scan processed 21 events in 46.331 seconds and flagged 6 food events without failed batches. Review found:

- Four flags had clear food-provision evidence: ALPFA-MILIA Feud, BMES Internship & Study Abroad Panel, Entertainment Committee General Body Meeting, and SCSC Bowling Night: FREE BOBA!
- Two flags were plausible but did not establish that food was free: Taco Night and the Gospel (28% Jev confidence) and KSA CHUSEOK (40%). They appeared under “Free Food Detected.”
- The other 15 captured listings contained no food-provision evidence.
- Many downloaded images were cropped 1200×640 banners, logos, or generic placeholders. OCR frequently produced noise instead of useful flyer text.
- All 12 labeled synthetic diagnostic cases passed; total diagnostic execution was approximately 0.6 seconds. This does not measure real-event accuracy or isolate classification time within the desktop scan.

The review was based on captured descriptions, OCR, and images, not attendance or organizer confirmation. Do not report this as 100% production accuracy or a verified missed-food rate. See [the detailed evaluation](JEV_EVALUATION_2026-09-30.md).

## Already implemented — preserve and build on these

- TypeSafe Jev replaces NVIDIA classification. `src/main/services/llm.ts` calls `POST https://api.typesafe.ai/v1/systemone`, pinned to `jev-1.13.0`.
- Requests contain isolated questions for each event, with Choice options `provided`, `not_provided`, and `uncertain`.
- Responses are validated; confidence and probability values are checked. Displayed explanation summaries are app-generated templates, not Jev-generated reasoning.
- Jev is text-only. Flyer images are processed by OCR before classification.
- Settings has a TypeSafe API-key field. `keytarStore.ts` uses macOS Keychain service `ducklink-food-finder`, account `typesafe-api-key`. The old NVIDIA entry is not migrated or read.
- Food results currently use `hasFood = foodStatus === 'provided'`; there is no confidence or evidence requirement for the food section.
- `foodStatus` can also be `unavailable` after a batch failure. Explicit uncertain/unavailable labels already exist for non-food cards.
- Total classification failure becomes a scan error. Partially failed results are not cached as a successful scan. Old-provider caches are ignored using `CLASSIFIER_VERSION = 'jev-food-v1'`.
- Food events sort before other events, then by start time. Preserve schedule behavior unless tests demonstrate a separate bug.
- Browser launch falls back to installed Google Chrome when Playwright Chromium is missing, using an isolated context rather than the personal Chrome profile.
- Scan generations suppress stale progress/results after cancellation; overlapping scans are rejected.
- Keychain saves/deletes are awaited, and in-memory key state changes only after successful storage operations.
- Startup cache failures no longer leave the loading screen stuck; scanning screen subscriptions detach on unmount.
- Local unpacked builds without updater metadata disable updates cleanly. DMG/ZIP builds include metadata; packaged update checking worked in the observed run.
- `npm test` exercises the Jev adapter and error handling. `npm run bench` evaluates 12 labeled diagnostic cases using the saved TypeSafe key.

## Recommended order

1. Capture full flyers and preserve source provenance.
2. Separate confirmed evidence, likely food, uncertain results, and failed checks in the UI.
3. Show verbatim supporting evidence.
4. Establish stage timing, then optimize downloads/OCR based on measurements.
5. Expand real-event evaluation and tune thresholds using that dataset.

Collect regression fixtures while doing each step. Do not wait until the final step to add meaningful tests.

## 1. Capture actual full flyers

### Problem

`fetchEventDetails` in `src/main/services/scraper.ts` favors `og:image` when it contains `/upload/`. A social-preview/banner image is not necessarily the actual flyer. The current single `imageUrl` field also conflates the image used for a card with the document used as classification evidence.

### Changes

- Inspect representative public Ducklink event pages to identify actual flyer/attachment elements and links. Treat selectors as an implementation question, not something established by this handoff.
- Prefer original event flyer/attachment resources over social-preview images when preparing OCR inputs.
- Keep a display/thumbnail image separate from the list of evidence images. Support multiple flyers per event where the page provides them.
- Record provenance: event URL, attachment URL, image role, and whether a full flyer or fallback was collected.
- Deduplicate equivalent image resources and reject clearly unrelated decorative assets. Preserve useful image alt text as a distinct evidence source.
- If a flyer cannot be obtained, keep descriptions and structured metadata usable. Record incomplete image coverage; do not interpret a download failure as proof that no food is offered.
- Use original files when available; avoid inventing URL transformations without verifying the site's behavior.

### Acceptance criteria

- Fixtures demonstrate an actual flyer being selected even when `og:image` points to a cropped banner.
- A generic placeholder is not treated as flyer evidence.
- Two attachments on one event can both contribute text without contaminating another event.
- Display thumbnails still work when flyer acquisition fails.
- The full-flyer source and fallback status remain available through caching and IPC.

### Files to inspect

`src/main/services/scraper.ts`, `imageDownloader.ts`, `imageDownloaderCli.ts`, `ocr.ts`, `src/main/ipc/handlers.ts`, `src/main/cli.ts`, and the shared event contracts.

## 2. Separate likely food from supported free-food claims

### Problem

A highest-probability `provided` choice with low confidence still appears under “Free Food Detected.” Food being mentioned, food being provided, and food being free are related but distinct claims.

### Changes

- Define the product policy explicitly: what counts as “free,” including food included with paid admission versus a separate food charge. The current rubric counts food included with admission.
- Preserve the raw Jev decision, confidence, and probabilities separately from the app’s presentation decision.
- Use clearly worded sections/badges, for example “Food provided,” “Possible food—check listing,” “No food evidence found,” and “Food check unavailable.” Reserve a stronger free-food label for evidence that supports it.
- Route weak/ambiguous evidence and low-confidence positive decisions to the possible-food group. Confidence alone is not proof of free food.
- Keep known API failures separate from negative food decisions.
- Centralize presentation rules so summaries, counts, cards, and ordering agree.
- Do not choose a permanent arbitrary cutoff such as 80% without real labeled validation. Any initial heuristic must be documented as provisional and easy to change.
- Preserve raw data when the presentation policy changes; bump the classification/cache version when semantics or stored schemas require invalidation.

### Acceptance criteria

- September 30 Taco Night and KSA Chuseok fixtures do not display as confidently established free food.
- Explicit free boba and explicit food-provided examples remain visible as supported food opportunities.
- Food drives, BYO snacks, paid food sales, gift-card prizes, and free admission alone do not become positive food evidence.
- Mixed `provided`/`uncertain`/`unavailable` results produce accurate counts and empty-state copy.
- Existing UI design and responsive behavior are preserved.

### Files to inspect

`src/main/services/llm.ts`, `foodDetector.ts`, `src/renderer/src/screens/ResultsScreen.tsx`, `components/EventCard.tsx`, `components/FoodBadge.tsx`, and main/renderer/preload event types.

## 3. Show supporting source excerpts

### Problem

The current `foodReasoning` strings are generic templates. They explain the label but do not show why a specific event was flagged.

### Changes

- Store verbatim evidence snippets with source kinds: structured food field, description, flyer alt text, or flyer OCR.
- Show a short source phrase such as “Pizza and drinks provided,” accompanied by its source label and the original event link.
- Keep structured food fields distinct during scraping instead of merging everything irreversibly into one description.
- For long documents, identify candidate spans in code and, if needed, use a Jev Choice question to select among bounded span IDs. Do not ask Jev to generate an explanation or a quotation: it returns typed decisions rather than prose.
- Validate any selected span against the original source. Never fabricate a quote or use another event’s text.
- Retain attribution and exact source text in the cache; render excerpts as plain text.
- If no usable excerpt exists, show an honest fallback and the coverage/uncertainty state.

### Acceptance criteria

- Positive cards show an actual relevant phrase when available.
- OCR excerpts are visibly distinguished from structured event metadata.
- Missing/invalid span selection never produces an invented quotation.
- Negative context such as “no food,” “bring your own,” or “pizza for sale” does not become a misleading positive excerpt.
- Tests cover event isolation, source attribution, and missing evidence.

## 4. Measure and optimize the scan pipeline

### Existing mechanisms

OCR already uses a content-hash cache with `OCR_CACHE_VERSION = 'v2'`, two workers, and multiple recognition passes including upscaling. Image downloads use concurrency 3. Jev uses batches of 5 with 3 concurrent batches. Avoid reimplementing caches or increasing concurrency without measurement.

### Changes

- Measure elapsed time for browser/navigation, list scraping, detail fetching, image downloads, OCR initialization/recognition, Jev requests, and cache serialization.
- Track workload counts and cache hits: events, images discovered/downloaded/skipped, bytes, OCR passes, OCR cache hits, and failed/uncertain classifications.
- Use monotonic elapsed timing and bounded local diagnostics. Keep credentials and request headers out of logs.
- Skip known generic placeholders and decorative logos for OCR; deduplicate images by content while retaining per-event provenance.
- Improve OCR reuse across scans; inspect cache placement, invalidation, and image-cleanup behavior before modifying persistence.
- Cache empty OCR results or explicit “no text” outcomes safely, with versioning. Distinguish no-text results from transient worker failures so failures do not become permanent cache hits.
- Consider a fast first OCR pass and additional passes only when measured quality justifies them. Do not skip hard flyers merely because descriptions lack food keywords.
- If timing supports it, replace download batch barriers with a bounded work queue so one slow image does not stall unrelated downloads.
- Add cancellation checks between queued items, and preserve the existing protection against canceled scans publishing results.
- Evaluate text-first fast paths only when their effect on missed flyer-only evidence can be measured.

### Acceptance criteria

- A scan reports useful stage timings and cache counts without exposing credentials.
- Warm and cold scans can be compared with their different cache conditions recorded.
- Placeholder skipping and duplicate reuse reduce unnecessary OCR work.
- Any claimed speed gain is supported by comparable measurements and does not discard known food evidence.
- Cancellation, retries, bounded concurrency, and partial-failure behavior remain correct.

## 5. Build a real-event evaluation set

### Changes

- Expand beyond the 12 synthetic cases with approximately 100–200 manually reviewed real events when available. Start smaller if necessary, but state sample size and coverage.
- Include full source text, relevant flyer evidence, source URLs, collection date, and reviewer rationale; exclude credentials and unnecessary personal data.
- Label separate facts where possible: food mentioned, food provided, separate food charge/free status, and whether the source is insufficient to decide.
- Include flyer-only food, noisy OCR, contradictory descriptions, drinks-only events, paid admission with included food, food sales, BYO food, food drives, restaurant names, and free-RSVP traps.
- Review source evidence before inspecting model predictions when practical. Keep disputed or unverifiable labels unresolved rather than forcing binary ground truth.
- Separate threshold/rubric development examples from a held-out evaluation set. Do not tune and report accuracy on the same sample.
- Store raw Jev choices/probabilities and the model/rubric version for reproducibility.
- Report false positive food flags, missed known food provision, uncertainty/abstention rate, per-class performance, latency, and API failures. Report free-food claims separately from general food provision.
- Do not assume a model confidence percentage equals a measured correctness probability on this dataset.

### Acceptance criteria

- Labeled fixtures are reviewable and replayable without re-scraping live pages.
- Synthetic tests and real-event evaluation scores are reported separately.
- Unresolved source cases are visible in the report and excluded from unsupported ground-truth claims.
- Threshold changes are justified against held-out examples and documented.

### Starting points

`src/main/benchModels.ts`, `tests/jev-classifier.cjs`, and [the existing real-event review](JEV_EVALUATION_2026-09-30.md).

## Contract, integration, and verification requirements

- Event fields originate in `src/main/services/scraper.ts` and are reflected in `src/renderer/src/types/index.ts`. Check both `src/preload/index.ts`/`index.d.ts` and `src/renderer/src/global.d.ts` for contract changes.
- Update desktop and CLI pipelines together when image/evidence structures change. Review both `cache.ts` and `cacheCli.ts`.
- Keep credentials in main-process Keychain storage. The key is entered through Settings → TypeSafe Jev Authentication → TypeSafe API Key → Save API Key. Do not copy key values into files, logs, test fixtures, or reports.
- Use the current repository orchestration/review/verification policy for substantial implementation; give workers bounded, non-overlapping ownership.
- Preserve current work. Inspect `git status` and existing modifications before editing.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` after relevant changes. Add targeted tests for the new behaviors rather than relying solely on existing Jev adapter tests.
- Verify startup, cached-result restoration, Settings, a fresh scan, cancellation/retry, event links, and mixed result states. Live classification uses the user-saved TypeSafe key; offline tests should not need it.
- For a local packaged macOS verification, `npm run dist:mac -- --publish never` builds DMG/ZIP artifacts without publishing. Keep both targets. Do not publish merely to validate these improvements.
- Release configuration needs care: the supplied AGENTS instructions name `shivenp14/ducklink-food-finder`, while current `package.json` and README name `shivenp14/agora`. Do not silently change the release destination as part of this work; reconcile it if a release/update workflow change is requested.
- Update README/docs for non-obvious public behavior and produce a concise verification report: changes, test outcomes, real-scan observations, and remaining limitations.

## Completion checklist

- [ ] Full flyers are preferred over cropped/social-preview images, with source attribution.
- [ ] Multiple evidence images and fallback coverage survive the pipeline and cache.
- [ ] Possible food, source uncertainty, and API failure are distinct from supported food claims.
- [ ] Cards expose relevant verbatim evidence with honest provenance.
- [ ] Stage timings identify measured bottlenecks; OCR work is selective and reusable.
- [ ] No loss of known food evidence from performance changes.
- [ ] Real-event evaluation and threshold policy are documented with sample limitations.
- [ ] Main/preload/renderer and desktop/CLI contracts remain aligned.
- [ ] Required checks, targeted regression tests, and independent review pass.
