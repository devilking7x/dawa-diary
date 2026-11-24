# DawaDiary — Medicine reminders & symptom journal

> **Not medical advice.** DawaDiary reminds you about medicines you already take and keeps a journal of what you log. It does **not diagnose** anything, does not predict risk, does not detect disease, and does not tell you what medicine to take. Always talk to a doctor.

A free, private, client-side web app built for the **AI for Medicine: A Global Student Hackathon on the Future of Care** (Devpost, hosted by Open Health AI Collective). Solo entry by Mohd Raja (devilking7x).

**Live demo:** https://devilking7x.github.io/dawa-diary/
**Hackathon:** https://ai-for-medicine.devpost.com/

## The problem

Care is bottlenecked on attention: the chronic patient nobody checks on. Between short clinic visits, nobody tracks whether daily medicines were actually taken, or how symptoms changed day to day — so the doctor gets a vague memory instead of a record. DawaDiary gives that person a simple, private log they can show at the visit.

## What it does

- **Medicine reminders** — add medicines (name, dose, up to 8 times/day, start date, notes) and see today's schedule. Mark each dose **Taken / Missed / Skipped**; overdue pending doses are flagged.
- **Adherence, honestly reported** — taken ÷ scheduled *and* taken ÷ decided, side by side, so pending doses are never silently dropped from the number.
- **Symptom journal** — log a symptom with severity 0–10 and a note. A chart shows the **daily mean severity over the last 14 days** with a **least-squares trend line**. Both are descriptive statistics of your own log — not a prediction, not a diagnosis.
- **Summary for a doctor visit** — printable plain-text summary plus CSV downloads (medicines, dose log, symptoms).
- **Private by design** — no account, no server, no analytics, no external requests. Data lives only in the browser's localStorage. A "Delete all my data" button wipes it.

## What it does NOT do

- No diagnosis, risk prediction, disease detection, or dose advice of any kind.
- No reminders when the browser is closed — this is a web page, not a phone alarm. Set a phone alarm for doses that must not be missed.
- No medical accuracy claims. The numbers are only as honest as the log.

## How to run it

No build step, no dependencies, no install. Any of these works:

```bash
# Option 1: just open it
open index.html        # or double-click it in a file manager

# Option 2: serve it locally
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How to test it

Requires Node.js (tests use the built-in runner; the smoke test uses `playwright-core` + a local Chromium — no downloads).

```bash
node --test tests/core.test.js   # 20 unit tests for the core logic
node tests/eval.js               # 20 scripted evaluation checks (see EVALUATION.md)
node tests/smoke.mjs             # 12 Playwright UI checks, screenshot to /tmp/dawadiary-smoke.png
```

All three suites pass (verified 24 Nov 2026: 20/20, 20/20, 12/12, zero console errors).

## Evaluation

Full method, metrics, and results: **[EVALUATION.md](EVALUATION.md)**. In short, on a deterministic synthetic 14-day dataset (2 medicines × 2 doses/day = 56 scheduled doses, 50 taken):

| Metric | Result |
|---|---|
| Adherence arithmetic vs hand-computed value | **89.3% — exact match** |
| Trend-slope recovery (true slope 0.50 pts/day) | **0.50 — exact match** |
| Dose CSV completeness | 57 lines (header + 56 doses), 50 taken rows |
| Unit tests / evaluation checks / UI smoke checks | 20/20, 20/20, 12/12 |

**Where it stops being useful:** the numbers are only as honest as the log. Missed entries, wrong times, or logging after the fact bias adherence; the app cannot detect that. The trend line needs ≥ 2 days with entries and says nothing about cause.

## Who benefits, who could be harmed

**Benefits:** people on regular medicines who want a simple, private record to show a doctor — especially where a visit is short and a clear log saves time.

**Could be harmed if:** someone treats the journal or the trend line as a diagnosis, delays seeing a doctor because "the app says nothing is wrong" (it never says that), or relies on a browser tab instead of a real alarm for a time-critical dose. The disclaimer on every screen and the absence of any diagnostic wording are the mitigations; they do not remove the risk.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole UI (5 tabs: Today, Medicines, Symptoms, Summary, About) |
| `styles.css` | Styling, incl. print styles for the summary |
| `core.js` | Pure logic (schedule math, adherence, trend, CSV, summary) — dependency-free, tested in Node |
| `app.js` | Browser wiring: localStorage, forms, SVG chart, downloads |
| `tests/core.test.js` | 20 unit tests |
| `tests/eval.js` | Scripted evaluation on synthetic data |
| `tests/smoke.mjs` | Playwright smoke test (Chromium via `playwright-core`) |
| `EVALUATION.md` | Evaluation method + results |
| `devpost-draft.md` | Draft submission text (not yet submitted) |

## Attribution

All code was written from scratch for this hackathon. No models, datasets, libraries, or third-party code are used — plain HTML/CSS/JavaScript, zero external requests. No AI model is involved in the app's function: the "trend" is least-squares arithmetic on the user's own log, and the app says so wherever the trend appears.

## License

MIT — see [LICENSE](LICENSE).
