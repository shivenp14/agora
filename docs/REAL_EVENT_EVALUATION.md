# Real-event review and evaluation

Use the real-event review export to keep manually judged event evidence separate from the synthetic diagnostic cases in `npm run bench`. The export stores the captured description and OCR, source URL, model and classifier versions, model decision, reviewer label, evidence basis, note, and timestamps. It also contains unresolved records so incomplete review coverage stays visible.

## What an evaluation result means

Run a recorded replay with:

```sh
npm run eval:reviews -- path/to/event-review-export.json
```

This reads only the local export. It validates the schema, required model result, label and provenance, and duplicate sources before scoring. Any missing or unavailable recorded decision makes the export invalid for scoring; correct or complete the review export first. The report shows the labeled denominator, unresolved count, label counts, both reviewer and model uncertainty rates, per-basis agreement, model-version cohorts, and every disagreement.

`captured_evidence` means the label is an evidence judgment based on the frozen description, OCR, and captured image metadata. It does not establish what the organizer actually served. `organizer_confirmed` and `attended` are reported together as externally confirmed labels and remain separated by basis in the detailed report. Reviewers should record the basis accurately; do not promote an evidence judgment to ground truth.

The evaluator scores all explicit labels, including a reviewer label of `uncertain`, as a three-way decision. Records in the separate unresolved list have no label and do not enter the agreement denominator. The model's `uncertain` decisions still count in model uncertainty coverage across every complete record, including unresolved ones. This keeps the denominator visible without treating a missing review as agreement or disagreement.

To compare a current Jev run on the frozen inputs, opt in explicitly:

```sh
npm run eval:reviews -- path/to/event-review-export.json --rerun
```

This requires the saved TypeSafe key and sends captured descriptions and OCR text to Jev. It does not scrape the source again or download new images. The default command never calls the model. A rerun replaces the recorded predictions for its report only; it does not update the export.

## Capture limits and historical review

The September 30, 2026 review in [JEV_EVALUATION_2026-09-30.md](JEV_EVALUATION_2026-09-30.md) covered 21 scanned events. It judged 19 decisions supported by the captured evidence and left two food flags unresolved because the listing mentioned food without establishing whether attendees received it without a separate charge. This was an assistant evidence review, not organizer or attendance verification. The original event descriptions, OCR, images, and model-result export are absent, so the report cannot be replayed or scored by this tool. No inputs or labels should be reconstructed from its summary table.

The reviewed scan also noted that many downloaded images were cropped 1200×640 banners or generic placeholders, and OCR could be noisy. The current capture path now collects several likely flyer candidates and combines OCR across downloaded images, but the historical scan has no retained source captures for comparison, so the improvement has not been measured. Absence of food text in captured evidence is not proof that food was absent from the full event. The review found no clear misses in captured text, but it cannot establish the true missed-food rate for complete original flyers.

## Collecting a useful labeled sample

1. On a completed scan, open **Manual food review** on any event, inspect **View captured evidence**, and save a label, basis, and supporting note. Review controls for **Needs confirmation** stay expanded; high-confidence and negative results remain available for representative sampling. Export with **Export review dataset** and keep the file local as a frozen record for replay.
2. Review the original listing alongside its exported description and OCR. Record only what those captures support. If the evidence mentions food but leaves provision or an additional charge unclear, label the evidence review `uncertain` or leave the record unresolved until it can be checked.
3. When practical, contact the organizer or attend the event and record that basis separately. Keep those labels distinct from captured-evidence judgments.
4. Note the supporting phrase or the unanswered question. Preserve uncertainty rather than guessing. Check low-confidence food flags and likely false negatives, since review of positive flags alone cannot measure missed food.
5. Collect examples across different event types and listing formats. Improve full-flyer capture and OCR coverage, then collect a larger manually labeled sample before changing thresholds or making broad accuracy claims.
6. Run recorded replay after each batch and inspect the disagreements and denominators. Report sample size, source basis, unresolved cases, and uncertainty with any results. Keep model and classifier versions visible when comparing runs.

Reviews are stored separately from scan cache and keyed by scan date and stable RSVP identity. Saving checks the displayed scan revision, so a label cannot silently attach to a newer capture. Changed captured evidence marks an existing review stale; the current event exports as unresolved until it is reviewed again. Downloaded image URLs, source kinds, and content hashes identify the image evidence without duplicating base64 images in the export. The export retains metadata and OCR rather than embedding original image files, so retain any original media needed for later visual review.

`npm run bench` remains useful for checking clear synthetic boundaries such as free admission, food sales, bring-your-own food, and explicit provision. Its 12 cases are diagnostic examples and do not estimate real-world performance.
