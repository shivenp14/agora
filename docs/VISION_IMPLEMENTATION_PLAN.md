# Agora vision implementation plan

## Target outcome

Help students find relevant upcoming campus opportunities across career events, club meetings, workshops, networking, and social activities. Food and refreshments become one optional discovery signal. Keep the existing Electron application, Ducklink authentication, OCR, secure credentials, and evidence-based reviews.

This is a proposed roadmap; no features in this plan have been implemented by this change.

## Current foundation and gaps

The app already collects Ducklink metadata and flyers, runs OCR and food classification, caches results, and supports manual food reviews. Non-food events remain visible. The main limitations are today-only collection, food-centered grouping and ranking, no search/category/date filters, no saved interests, and a Ducklink-specific source and review identity.

## 1. Make upcoming events browsable

- Introduce a shared, versioned event contract for main, preload, and renderer. Keep original listing evidence separate from derived classifications; include source identity, capture time, normalized dates/time zone, and field provenance.
- Replace the scraper's Today/Tomorrow boundary with a selected date range. Start with today and the next seven days, within what Ducklink actually exposes. Handle pagination, missing times, and duplicate listings explicitly.
- Add search and date filters. Offer chronological sorting and retain food as an optional filter/sort signal. Preserve access to every collected event.
- Update empty states and progress messages to distinguish no matching results, incomplete collection, and a failed scan.

**Done when:** a mixed-date fixture produces all in-range events once, missing times remain visible, and students can search upcoming events without a food classification requirement.

**Primary areas:** `src/main/services/scraper.ts`, scan orchestration in `src/main/ipc/handlers.ts`, event types, preload contracts, cache, and `ResultsScreen.tsx`.

## 2. Classify broader opportunities

- Define a small multi-label taxonomy: career, club meeting, workshop, networking, and social. Events may match several categories or remain unclassified. Keep food's existing three-state judgment independent.
- Add category classification alongside food classification. First verify whether the existing Jev contract can express the chosen category decisions; preserve strict response validation and use separate decisions if required.
- Retain evidence references and classification/schema versions. Display a concise explanation based on captured evidence. Treat missing information as unknown rather than inventing event details.
- Show category labels and filters in results. Preserve chronological sorting and existing food reviews.
- Version incompatible caches and review/export contracts deliberately. Existing food labels must survive upgrades; stale evidence must remain distinguishable from current reviews.

**Done when:** a career workshop can receive both labels, a social event without food is discoverable by its category, invalid model responses are handled explicitly, and existing food evaluation still works.

**Primary areas:** `src/main/services/llm.ts`, `foodDetector.ts` or a category-classifier sibling, shared event contracts, cache, preload, results UI, and review/export types.

## 3. Add student-controlled relevance

- Save explicit interests locally, with optional preferred times and a food preference. Use a short, skippable setup and editable Settings controls.
- Introduce deterministic ranking from interest matches, selected date range, and time. Keep chronological browsing available and make food's influence configurable.
- Explain recommendations with visible reasons, such as "Matches your career interest" and the relevant evidence. Confidence must not stand in for student relevance.
- Add saved and dismissed events with stable identity so rescanning preserves choices.

**Done when:** changing interests predictably changes ranking, neutral preferences give a useful chronological view, and rescanning preserves saved events and reviews.

**Primary areas:** a ranking service, local preferences storage and IPC, Settings, results controls, and event cards.

## 4. Establish quality gates throughout rollout

Begin this work with phase 1 and extend it with each new signal; it is not a final cleanup phase.

- Capture a representative real-event dataset covering categories, overlapping labels, missing flyers, weak OCR, unknown labels, and date boundaries.
- Extend offline reviews and evaluation to report per-category precision/recall, unresolved judgments, denominators, and provenance. Agree on rollout targets from the observed baseline before enabling new ranking defaults.
- Measure ingestion completeness and date/location extraction separately from classification. Track OCR failures, provider errors, latency, and request cost.
- Preserve a frozen evaluation sample separate from examples used to tune classification. Do not present exported-sample agreement as general production accuracy.
- Validate untrusted listing/OCR input and strict provider outputs; keep credentials and model requests in main behind preload.

**Done when:** new classification and ranking behavior has reproducible evaluation, migration and regression coverage, and documented limitations. Run typecheck and lint for implementation changes, then verify the locally installed packaged app.

## 5. Expand sources after Ducklink works well

- Introduce a source-adapter interface for authentication, listing collection, detail extraction, and canonical identity.
- Add one accessible campus calendar or organization feed at a time. Assess access and available data before promising support for a source.
- Deduplicate cross-posted events using stable links and normalized metadata; retain all source evidence. Avoid merging distinct events solely because names match.
- Separate event identity from Ducklink RSVP identity. Keep reviews attached to the evidence that was actually reviewed when source records change or merge.

**Done when:** two sources contribute to one browsable feed, duplicate events retain their provenance, and a failed source does not erase successful results from another.

## 6. Make discovery a recurring habit

- Add opt-in refresh schedules, change detection, and reminders for saved events. Surface freshness and partial-source status.
- Add calendar export before considering account-connected calendar integrations. Let students choose what leaves the app.
- Respect authentication expiry, avoid overlapping scans, and control repeated OCR/classification work through evidence and classifier versions.

**Done when:** refreshes preserve preferences and reviews, changed events are recognizable, and reminders occur only under the student's chosen settings.

## Recommended delivery order

Ship phase 1 first as a useful browsing improvement, then phase 2 with its evaluation gate. Add personalization after category quality is established. Broader sources and background discovery follow once identities, evidence, and migrations are reliable.

The first implementation should stay focused on Ducklink, upcoming dates, shared event contracts, and search/date controls. Leave additional sources and calendar integrations for later milestones. Effort estimates should follow a short check of Ducklink's upcoming-event pagination and date formats, which constrain the first release.
