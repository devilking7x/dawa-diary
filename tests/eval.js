'use strict';
/**
 * DawaDiary — scripted evaluation (the numbers quoted in EVALUATION.md).
 *
 * Method: build a fully synthetic, deterministic 14-day dataset (no real
 * patient data anywhere), run the app's own core functions over it, and
 * compare the outputs against values computed INDEPENDENTLY here, by hand.
 * Nothing here is a clinical claim: the "ground truth" is arithmetic.
 *
 * Metric 1 — adherence arithmetic: 2 medicines x 2 doses/day x 14 days
 *   = 56 scheduled doses. Mark 50 taken, 4 missed, 2 skipped.
 *   Expected rate = 50 / 56 = 0.892857... (89.3%).
 * Metric 2 — trend recovery: one symptom entry per day, severity
 *   2.0 + 0.5 * dayIndex (day 0..13) -> least-squares slope must be 0.50.
 * Metric 3 — export completeness: dose CSV must contain exactly 56 data
 *   rows + header; summary must contain the true counts.
 *
 * Run: node tests/eval.js   (exit code 0 = all checks passed)
 */
const D = require('../core.js');

let failures = 0;
function check(name, actual, expected, tolerance) {
  const ok = tolerance === undefined
    ? Object.is(actual, expected)
    : typeof actual === 'number' && typeof expected === 'number' && Math.abs(actual - expected) <= tolerance;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: actual=${actual} expected=${expected}${tolerance !== undefined ? ` (±${tolerance})` : ''}`);
  if (!ok) failures += 1;
}

/* ---- build the synthetic world ---- */
const medA = D.createMedicine({ name: 'MedA', dose: '500 mg', times: ['08:00', '20:00'], startDate: '2026-11-01' }).medicine;
const medB = D.createMedicine({ name: 'MedB', dose: '1 tablet', times: ['09:00', '21:00'], startDate: '2026-11-01' }).medicine;
const meds = [medA, medB];

const days = D.dateRange('2026-11-01', '2026-11-14'); // 14 days
let allKeys = [];
for (const day of days) for (const m of meds) for (const d of D.dosesForDay(m, day)) allKeys.push(d.key);

// decide outcomes in a fixed pattern: first 50 taken, next 4 missed, last 2 skipped
let doseLog = {};
allKeys.forEach((key, i) => {
  const status = i < 50 ? 'taken' : i < 54 ? 'missed' : 'skipped';
  doseLog = D.markDose(doseLog, key, status).log;
});

// synthetic symptoms: severity = 2.0 + 0.5 * dayIndex, one entry per day
let symptoms = [];
days.forEach((day, i) => {
  const r = D.addSymptom(symptoms, { name: 'Headache', severity: 2 + 0.5 * i, date: day, note: '' });
  symptoms = r.log;
});

/* ---- Metric 1: adherence ---- */
const adh = D.adherence(meds, doseLog, '2026-11-01', '2026-11-14');
check('M1 scheduled doses', adh.scheduled, 56);
check('M1 taken', adh.taken, 50);
check('M1 missed', adh.missed, 4);
check('M1 skipped', adh.skipped, 2);
check('M1 pending', adh.pending, 0);
check('M1 adherence rate', adh.rate, 50 / 56, 1e-12);
check('M1 adherence % (1dp)', Number((adh.rate * 100).toFixed(1)), 89.3);
check('M1 decided rate', adh.decidedRate, 50 / 56, 1e-12);

/* ---- Metric 2: trend recovery ---- */
const daily = D.dailyMeans(symptoms, '2026-11-14', 14);
check('M2 daily means count', daily.length, 14);
check('M2 first day mean', daily[0].mean, 2);
check('M2 last day mean', daily[13].mean, 8.5);
const slope = D.trendSlope(daily);
check('M2 trend slope (points/day)', slope.slope, 0.5, 0.0001);
check('M2 trend days used', slope.n, 14);

/* ---- Metric 3: export completeness ---- */
const csv = D.dosesToCSV(meds, doseLog, '2026-11-01', '2026-11-14');
const csvLines = csv.trim().split('\n');
check('M3 dose CSV total lines (header + 56)', csvLines.length, 57);
check('M3 dose CSV header', csvLines[0], 'date,time,medicine,dose,status');
const takenRows = csvLines.filter((l) => l.endsWith(',taken')).length;
check('M3 dose CSV taken rows', takenRows, 50);

const summary = D.buildSummary(meds, doseLog, symptoms, '2026-11-01', '2026-11-14');
check('M3 summary contains scheduled count', summary.includes('Scheduled doses: 56'), true);
check('M3 summary contains 89.3%', summary.includes('89.3%'), true);
check('M3 summary contains disclaimer', summary.includes('not medical advice'), true);
check('M3 summary contains 14 symptom entries', summary.includes('Entries: 14'), true);

console.log(failures === 0 ? '\nEVALUATION: ALL CHECKS PASSED' : `\nEVALUATION: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
