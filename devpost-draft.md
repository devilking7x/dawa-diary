# Devpost draft — AI for Medicine (DO NOT SUBMIT — draft only)

**Hackathon:** AI for Medicine: A Global Student Hackathon on the Future of Care
**Deadline:** Friday, December 4, 2026, 11:45 PM ET (Saturday, December 5, 2026, 10:15 AM IST)
**Entrant:** Mohd Raja (devilking7x), solo, student — free entry
**Status:** DRAFT. Repository public and live; demo video still to be recorded; submission NOT yet made.

## Title

DawaDiary — Medicine reminders & symptom journal

## Tagline

A free, private log that helps people actually take their medicines — and show a doctor what happened between visits.

## Try it out

- **Live app:** https://devilking7x.github.io/dawa-diary/
- **Repository:** https://github.com/devilking7x/dawa-diary
- **Evaluation:** https://github.com/devilking7x/dawa-diary/blob/main/EVALUATION.md

## Built with

`HTML` `CSS` `JavaScript` (no framework, no build step, no libraries, no external requests)

## Description

> **Not medical advice.** DawaDiary does not diagnose anything, predict risk, detect disease, or tell anyone what medicine to take. Talk to a doctor.

### The problem — and who has it

Care is bottlenecked on attention, not knowledge: the chronic patient nobody checks on. Between short clinic visits, nobody tracks whether daily medicines were actually taken, or how symptoms changed day to day — so the doctor gets a vague memory instead of a record. This hits hardest where visits are short, infrequent, or expensive. DawaDiary is for that person: someone on regular medicines who wants a simple, private log to show at the visit.

### What it does

- **Medicine reminders:** add medicines (name, dose, up to 8 times/day, start date, notes) and see today's schedule. Mark each dose Taken / Missed / Skipped; overdue pending doses are flagged.
- **Adherence, honestly reported:** taken ÷ scheduled *and* taken ÷ decided, side by side, so pending doses are never silently dropped from the number.
- **Symptom journal:** log a symptom with severity 0–10 and a note. A chart shows the daily mean severity over the last 14 days with a least-squares trend line. Both are descriptive statistics of the user's own log — not a prediction, not a diagnosis.
- **Summary for a doctor visit:** printable plain-text summary plus CSV downloads (medicines, dose log, symptoms).
- **Private by design:** no account, no server, no analytics, no external requests. Data lives only in the browser's localStorage, with a "Delete all my data" button.

### Method

Plain HTML/CSS/JavaScript, zero dependencies. The core logic (`core.js`) is a dependency-free module with no DOM access, so it is tested directly in Node. All data stays on the device; there is no backend, no model, and no dataset. The "trend" is least-squares arithmetic on the user's own log, and the app says so wherever the trend appears. No AI model is involved in the app's function — the honest statistical touch is the trend line, and it is labelled as arithmetic, not intelligence.

### Evaluation

**Metric 1 — adherence arithmetic.** On a deterministic synthetic 14-day dataset (2 medicines × 2 doses/day = 56 scheduled doses; 50 marked taken, 4 missed, 2 skipped), the app's adherence matched the hand-computed value exactly: **89.3%** (50/56).

**Metric 2 — trend recovery.** On synthetic symptom data rising exactly 0.5 severity points per day, the least-squares slope recovered was **0.50 points/day** — exact.

**Metric 3 — export completeness.** The dose CSV contained exactly 57 lines (header + 56 doses) with 50 taken rows; the printable summary contained the true counts and the disclaimer.

**Supporting tests (all run 24 Nov 2026):** 20/20 unit tests (`node --test tests/core.test.js`), 20/20 scripted evaluation checks (`node tests/eval.js`), 12/12 Playwright UI smoke checks with zero console errors and zero page errors (`node tests/smoke.mjs`). Full method, dataset, and results: `EVALUATION.md` in the repository.

**Baseline:** pen and paper (or memory) — $0, no computation, no export, no trend view. DawaDiary matches paper on cost ($0, free hosting) and beats it on automatic adherence arithmetic, printable/CSV summaries, and a trend view. It is worse than paper in one respect: it cannot remind you when the browser is closed, while a paper list on the fridge is always visible.

**Where the result stops being useful:** the numbers are only as honest as the log. Missed entries, wrong times, or logging after the fact bias adherence, and the app cannot detect that. The trend line needs entries on at least 2 different days and says nothing about cause. Nothing here was validated against clinical outcomes, and nothing should be used to change a dose, stop a medicine, or delay care.

### Who benefits, and who could be harmed

**Benefits:** people on regular medicines who want a simple, private record to show a doctor — especially where a visit is short and a clear log saves time.

**Could be harmed if:** someone treats the journal or the trend line as a diagnosis, delays seeing a doctor because "the app says nothing is wrong" (it never says that), or relies on a browser tab instead of a real alarm for a time-critical dose. The disclaimer on every screen and the absence of any diagnostic wording are the mitigations; they do not remove the risk.

### Limitations

- No reminders when the browser is closed — set a phone alarm for doses that must not be missed.
- No accounts or sync: the log lives in one browser; clearing site data deletes it.
- No clinical validation of any kind; no diagnostic, risk, or detection claims are made.
- Only as accurate as the user's own logging.

### What I would do with another month

- Add optional, explicit phone-alarm export (e.g. an .ics file of dose times) so reminders survive a closed browser — still fully local.
- Run a small usability study with 5–10 real users on regular medicines (with consent, no health data collected) and measure time-to-log-a-dose and error rate.
- Add multi-language UI (Hindi first), since the target users often prefer it.
- Any health-inference feature would require a labelled clinical dataset and a held-out evaluation first — that work is deliberately out of scope for this entry.

### Attribution

All code was written from scratch for this hackathon. No models, datasets, libraries, or third-party code are used. No AI model is involved in the app's function.

## Testing instructions (for judges)

1. Open https://devilking7x.github.io/dawa-diary/ — no install, no account, nothing to download.
2. Go to **Medicines**, add a medicine (e.g. Paracetamol, 500 mg, 08:00 + 20:00, start date today) and press **Add medicine**.
3. Go to **Today** — the two doses appear. Press **Taken ✓** on one; the counters update (1 taken, 1 still pending).
4. Go to **Symptoms**, log "Headache" at severity 5 for today, then log another entry for yesterday (change the date) — the trend box updates once 2 days have entries.
5. Go to **Summary & export** — the summary shows the real counts (2 scheduled, 50.0% taken). Press **Print summary** or download any CSV.
6. To verify the evaluation yourself: clone the repo and run `node --test tests/core.test.js` (20 tests) and `node tests/eval.js` (20 checks). Both pass with no install step.

## Still to do before submitting

- [ ] Record demo video (show the app working in the first 60 seconds, per judging criteria)
- [ ] Submit on Devpost before 4 Dec 2026, 11:45 PM ET / 5 Dec 2026, 10:15 AM IST
