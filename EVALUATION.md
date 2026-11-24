# Evaluation — DawaDiary

This hackathon requires every entry to be evaluated: *"A demo is not evidence. State what you measured, how you measured it, and what the result means. Compare your output with a reference, a baseline, or a stated cost. Name the conditions under which your result stops being useful."*

This file is that evaluation. Everything below is reproducible with the commands at the bottom. **No real patient data is used anywhere** — the dataset is synthetic, deterministic, and built by hand.

## What was measured

The app's job is bookkeeping, not medicine: it schedules doses, records what the user says they took, and summarises the log. So the evaluation measures **whether the bookkeeping arithmetic is correct**, not whether any health outcome improves. Three metrics:

| # | Metric | Reference (ground truth) | Method |
|---|---|---|---|
| M1 | Adherence arithmetic | Hand-computed counts and rate | Scripted 14-day synthetic log, compare app output to values computed independently in the eval script |
| M2 | Trend recovery | Known synthetic slope of exactly 0.50 severity points/day | Daily means + least-squares slope over the synthetic log, compare to the planted slope |
| M3 | Export completeness | Hand-counted rows | Dose CSV row count and summary text checked against the known synthetic log |

## The synthetic dataset

Built in `tests/eval.js`, fully deterministic (no randomness):

- **Medicines:** MedA (500 mg, 08:00 + 20:00) and MedB (1 tablet, 09:00 + 21:00), both starting 2026-11-01.
- **Period:** 2026-11-01 → 2026-11-14 (14 days).
- **Scheduled doses:** 2 medicines × 2 doses/day × 14 days = **56**.
- **Outcomes (fixed pattern):** first 50 marked **taken**, next 4 **missed**, last 2 **skipped**, 0 pending.
- **Symptoms:** one entry per day, severity = **2.0 + 0.5 × dayIndex** (day 0 → 2.0, day 13 → 8.5). A perfectly linear rise, so the true trend slope is exactly 0.50 points/day.

This is a *correctness* test of the pipeline, not a clinical study: it checks that the code computes what it claims to compute. It says nothing about whether real users will log honestly — see *Limitations*.

## Results

Run 24 Nov 2026: `node tests/eval.js` — **20/20 checks passed**.

| Check | Actual | Expected | Status |
|---|---|---|---|
| M1 scheduled doses | 56 | 56 | PASS |
| M1 taken / missed / skipped / pending | 50 / 4 / 2 / 0 | 50 / 4 / 2 / 0 | PASS |
| M1 adherence rate | 0.892857… | 50/56 | PASS |
| M1 adherence % (1 d.p.) | 89.3% | 89.3% | PASS |
| M1 decided rate (taken ÷ decided) | 0.892857… | 50/56 | PASS |
| M2 daily means count | 14 | 14 | PASS |
| M2 first / last day mean | 2 / 8.5 | 2 / 8.5 | PASS |
| M2 trend slope | 0.50 pts/day | 0.50 | PASS |
| M2 trend days used | 14 | 14 | PASS |
| M3 dose CSV lines | 57 (header + 56) | 57 | PASS |
| M3 dose CSV taken rows | 50 | 50 | PASS |
| M3 summary contains "Scheduled doses: 56" | yes | yes | PASS |
| M3 summary contains "89.3%" | yes | yes | PASS |
| M3 summary contains disclaimer | yes | yes | PASS |
| M3 summary contains 14 symptom entries | yes | yes | PASS |

**What the results mean:** the schedule math, the adherence fractions, the daily-mean computation, the least-squares slope, the CSV export, and the printable summary all reproduce hand-computed values exactly on this dataset. The app does not invent numbers: every figure it shows is traceable to logged entries.

### Supporting test suites

| Suite | Command | Result (24 Nov 2026) |
|---|---|---|
| Unit tests | `node --test tests/core.test.js` | **20/20 pass** — medicines (add/edit/delete, validation), schedule math, overdue flagging, dose-log validation, adherence incl. empty ranges, symptom validation (severity 0–10), daily means with gaps, trend slope incl. gappy data, CSV quoting, summary content |
| Scripted evaluation | `node tests/eval.js` | **20/20 pass** (table above) |
| UI smoke test | `node tests/smoke.mjs` | **12/12 pass** — page loads with **zero console errors and zero page errors**; medicine added through the real UI; dose marked taken; symptom logged; trend text renders; summary shows the medicine + disclaimer; data persists to localStorage. Screenshot: `/tmp/dawadiary-smoke.png` |

### Baseline / comparison

The honest baseline for a reminder-and-journal tool is **pen and paper** (or memory): $0, no computation, no export, no trend view. DawaDiary matches paper on cost ($0, free hosting) and beats it on: automatic adherence arithmetic (paper requires hand-counting 56 doses), a printable/CSV summary (paper must be rewritten), and a trend view (paper requires hand-plotting). It is *worse* than paper in one respect: it cannot remind you when the browser is closed, while a paper list on the fridge is always visible. That limitation is stated in the app and the README.

No accuracy claim is made against any clinical reference, because the app makes no clinical claim. Any future version that added a health inference would need a labelled clinical dataset and a held-out evaluation — that work is explicitly out of scope here.

## Conditions under which the result stops being useful

1. **Dishonest or incomplete logs.** If the user forgets to log doses, logs them late, or marks doses taken that were not taken, adherence is biased and the app cannot detect it. The evaluation proves the arithmetic, not the data.
2. **Too little data.** The trend line needs entries on at least 2 different days; with 1 day it correctly refuses to draw a slope. With few days, the slope is noisy and means almost nothing.
3. **Confusing correlation with cause.** A rising severity trend says *what was logged*, not *why*. The app never attributes cause; a user who reads cause into it is misusing it.
4. **Browser closed / storage cleared.** Reminders only work while the page is open; clearing site data deletes the log. Time-critical doses need a real phone alarm.
5. **Not a medical device.** Nothing here was validated against clinical outcomes, and nothing should be used to change a dose, stop a medicine, or delay care.

## How to reproduce

```bash
git clone https://github.com/devilking7x/dawa-diary.git
cd dawa-diary
node --test tests/core.test.js   # 20 unit tests
node tests/eval.js               # 20 evaluation checks (this file's table)
node tests/smoke.mjs             # 12 UI checks (needs playwright-core + local Chromium;
                                 # screenshot to /tmp/dawadiary-smoke.png)
```

No network access, no API keys, no install step, and no seeded randomness are involved — the eval is deterministic.
