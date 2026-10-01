# Jev evaluation — September 30, 2026

Model: `jev-1.13.0`. Fresh desktop scan: 21 events, 6 food flags, no failed batches, completed in 46.331 seconds.

## Method and limits

Reviewed all captured descriptions, OCR text, and downloaded images. Classification agreement here is an assistant evidence judgment, not organizer-confirmed ground truth. No independent attendance or organizer verification was performed. Many downloaded images are cropped 1200×640 banners or generic placeholders, and OCR often contains noise. Therefore this review cannot establish the true missed-food rate for complete original flyers.

## Diagnostic cases

`npm run bench` matched all 12 labeled synthetic cases: 12/12 (100%), zero false food positives, zero missed food cases, 0.6 seconds total. Cases include explicit free pizza, free admission, BYO snacks, food drives, paid food sales, included lunch, self-paid restaurant outings, gift-card prizes, drinks, and uncertain snacks. This small synthetic score is not production accuracy.

## Real event review

Four flagged events have clear food-provision evidence. Two flagged events are plausible but do not establish that food is free; they should be treated as needing confirmation. The other 15 captured listings show no evidence of food provided. No clear false positives or missed explicit food mentions were found in the captured evidence. This is 19 clearly supported decisions out of 21 reviewed, with two unresolved cases, not a verified accuracy percentage.

| Event | Jev decision | Confidence | Evidence review |
|---|---|---|---|
| [Fall 2026 Game Room Sign- In](https://ducklink.stevens.edu/rsvp_boot?id=401707&rel=logo) | not_provided | 99% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Climbing at Gravity Vault (Wednesday 9/30/2026)](https://ducklink.stevens.edu/rsvp_boot?id=402183&rel=logo) | not_provided | 100% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [ALPFA-MILIA Feud](https://ducklink.stevens.edu/rsvp_boot?id=404049&rel=logo) | provided | 98% | Explicit FOOD WILL BE PROVIDED and Wingstop provided in description/flyer alt text. |
| [Aircraft Design](https://ducklink.stevens.edu/rsvp_boot?id=404221&rel=logo) | not_provided | 99% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Chess Club Meeting](https://ducklink.stevens.edu/rsvp_boot?id=402598&rel=logo) | not_provided | 100% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Women's Soccer vs Drew](https://ducklink.stevens.edu/rsvp_boot?id=401560&rel=logo) | not_provided | 99% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [BMES Internship & Study Abroad Panel](https://ducklink.stevens.edu/rsvp_boot?id=404187&rel=logo) | provided | 100% | Explicit pizza and drinks provided; structured Food Provided field. |
| [G&T Presentation Night](https://ducklink.stevens.edu/rsvp_boot?id=404045&rel=logo) | not_provided | 99% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Mass](https://ducklink.stevens.edu/rsvp_boot?id=402065&rel=logo) | not_provided | 100% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Adoration and Confession](https://ducklink.stevens.edu/rsvp_boot?id=402286&rel=logo) | not_provided | 100% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Project Matching](https://ducklink.stevens.edu/rsvp_boot?id=404317&rel=logo) | not_provided | 98% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Wildcard Week Watch Party (Yankees vs Red Sox) with RA Christian](https://ducklink.stevens.edu/rsvp_boot?id=404274&rel=logo) | not_provided | 99% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Dodgeball](https://ducklink.stevens.edu/rsvp_boot?id=404069&rel=logo) | not_provided | 99% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [SRCC Movie Night](https://ducklink.stevens.edu/rsvp_boot?id=403729&rel=logo) | not_provided | 98% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [SASA Big Little](https://ducklink.stevens.edu/rsvp_boot?id=404308&rel=logo) | not_provided | 97% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Entertainment Committee - General Body Meeting](https://ducklink.stevens.edu/rsvp_boot?id=401269&rel=logo) | provided | 98% | Structured Food Provided field in the listing. |
| [ESC Rep Meeting](https://ducklink.stevens.edu/rsvp_boot?id=404295&rel=logo) | not_provided | 97% | No food-provision evidence in the captured description, OCR, or downloaded image. |
| [Taco Night and the Gospel](https://ducklink.stevens.edu/rsvp_boot?id=402454&rel=logo) | provided | 28% | Tacos are mentioned, but organizer provision and absence of a separate charge are not explicit. Plausible food event; cannot confirm free food. |
| [SCSC Bowling Night: FREE BOBA!](https://ducklink.stevens.edu/rsvp_boot?id=404312&rel=logo) | provided | 99% | Explicit FREE BOBA in title and description. |
| [KSA CHUSEOK](https://ducklink.stevens.edu/rsvp_boot?id=403344&rel=logo) | provided | 40% | Description promises Korean food, but does not explicitly establish absence of a separate food charge. Plausible food event; cannot confirm free food. |
| [GBM #3 09/30/2026](https://ducklink.stevens.edu/rsvp_boot?id=404336&rel=logo) | not_provided | 97% | No food-provision evidence in the captured description, OCR, or downloaded image. |

## Judgment

Jev looks suitable for this narrow task and handled the basic diagnostic boundaries well. The real batch supports continued use, but broader accuracy remains unmeasured. Review low-confidence food flags, improve full-flyer capture/OCR, and collect more manually labeled real events before tuning thresholds or reporting a general accuracy rate.
