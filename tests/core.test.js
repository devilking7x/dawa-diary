'use strict';
/* DawaDiary core unit tests. Run: node --test tests/core.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../core.js');

const MED = { name: 'Paracetamol', dose: '500 mg', times: ['08:00', '20:00'], startDate: '2026-11-01', notes: 'after food' };

/* ---------------- dates & times ---------------- */
test('isValidDateStr accepts real dates and rejects impossible ones', () => {
  assert.equal(D.isValidDateStr('2026-11-24'), true);
  assert.equal(D.isValidDateStr('2026-02-30'), false); // Feb 30 does not exist
  assert.equal(D.isValidDateStr('2026-13-01'), false);
  assert.equal(D.isValidDateStr('24-11-2026'), false);
  assert.equal(D.isValidDateStr(''), false);
  assert.equal(D.isValidDateStr(null), false);
  assert.equal(D.isValidDateStr('2024-02-29'), true); // leap year
  assert.equal(D.isValidDateStr('2026-02-29'), false); // not a leap year
});

test('isValidTimeStr accepts 00:00–23:59 and rejects the rest', () => {
  assert.equal(D.isValidTimeStr('00:00'), true);
  assert.equal(D.isValidTimeStr('23:59'), true);
  assert.equal(D.isValidTimeStr('24:00'), false);
  assert.equal(D.isValidTimeStr('8:00'), false);
  assert.equal(D.isValidTimeStr('08:60'), false);
  assert.equal(D.isValidTimeStr(''), false);
});

test('addDays crosses month boundaries; dateRange is inclusive and empty when reversed', () => {
  assert.equal(D.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(D.addDays('2026-12-01', -1), '2026-11-30');
  assert.deepEqual(D.dateRange('2026-11-01', '2026-11-03'), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepEqual(D.dateRange('2026-11-03', '2026-11-01'), []);
  assert.deepEqual(D.dateRange('bad', '2026-11-01'), []);
});

test('minutesSinceMidnight converts HH:MM correctly', () => {
  assert.equal(D.minutesSinceMidnight('00:00'), 0);
  assert.equal(D.minutesSinceMidnight('08:30'), 510);
  assert.equal(D.minutesSinceMidnight('23:59'), 1439);
  assert.ok(Number.isNaN(D.minutesSinceMidnight('25:00')));
});

/* ---------------- medicines ---------------- */
test('validateMedicine rejects bad input with clear messages', () => {
  assert.ok(D.validateMedicine({ name: '', dose: '500 mg', times: ['08:00'], startDate: '2026-11-01' }).length > 0);
  assert.ok(D.validateMedicine({ name: '  ', dose: '500 mg', times: ['08:00'], startDate: '2026-11-01' }).length > 0);
  assert.ok(D.validateMedicine({ name: 'X', dose: '', times: ['08:00'], startDate: '2026-11-01' }).length > 0);
  assert.ok(D.validateMedicine({ name: 'X', dose: '1', times: [], startDate: '2026-11-01' }).length > 0);
  assert.ok(D.validateMedicine({ name: 'X', dose: '1', times: ['25:00'], startDate: '2026-11-01' }).length > 0);
  assert.ok(D.validateMedicine({ name: 'X', dose: '1', times: ['08:00', '08:00'], startDate: '2026-11-01' }).length > 0);
  assert.ok(D.validateMedicine({ name: 'X', dose: '1', times: ['08:00'], startDate: '2026-02-30' }).length > 0);
  assert.ok(D.validateMedicine({ name: 'X', dose: '1', times: ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00'], startDate: '2026-11-01' }).length > 0);
  assert.ok(D.validateMedicine({ name: 'x'.repeat(101), dose: '1', times: ['08:00'], startDate: '2026-11-01' }).length > 0);
  assert.deepEqual(D.validateMedicine(null), ['Medicine details are missing.']);
});

test('createMedicine sorts and dedupes times; addMedicine does not mutate the input list', () => {
  const { medicine, errors } = D.createMedicine({ ...MED, times: ['20:00', '08:00', '20:00'] });
  // duplicate time is a validation error, so use a clean unsorted input instead
  assert.ok(errors.length > 0);
  const ok = D.createMedicine({ ...MED, times: ['20:00', '08:00'] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.medicine.times, ['08:00', '20:00']);
  assert.equal(ok.medicine.name, 'Paracetamol');

  const before = [];
  const res = D.addMedicine(before, MED);
  assert.deepEqual(res.errors, []);
  assert.equal(before.length, 0, 'input list must not be mutated');
  assert.equal(res.list.length, 1);
  const bad = D.addMedicine(res.list, { ...MED, name: '' });
  assert.ok(bad.errors.length > 0);
  assert.equal(bad.list.length, 1, 'failed add must not change the list');
});

test('updateMedicine edits fields and rejects unknown ids and bad patches', () => {
  const { list } = D.addMedicine([], MED);
  const id = list[0].id;
  const ok = D.updateMedicine(list, id, { dose: '650 mg' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.medicine.dose, '650 mg');
  assert.equal(ok.medicine.name, 'Paracetamol');
  assert.equal(list[0].dose, '500 mg', 'original list must not be mutated');

  const missing = D.updateMedicine(list, 'no-such-id', { dose: '650 mg' });
  assert.deepEqual(missing.errors, ['Medicine not found.']);
  const badPatch = D.updateMedicine(list, id, { times: ['99:99'] });
  assert.ok(badPatch.errors.length > 0);
  assert.equal(badPatch.list[0].dose, '500 mg');
});

test('deleteMedicine removes by id and reports whether anything was deleted', () => {
  const { list } = D.addMedicine([], MED);
  const id = list[0].id;
  assert.deepEqual(D.deleteMedicine(list, id), { list: [], deleted: true });
  assert.deepEqual(D.deleteMedicine(list, 'nope').deleted, false);
  assert.equal(D.deleteMedicine(list, 'nope').list.length, 1);
});

/* ---------------- schedule & dose log ---------------- */
test('dosesForDay returns nothing before the start date', () => {
  const { medicine } = D.createMedicine(MED);
  assert.equal(D.dosesForDay(medicine, '2026-10-31').length, 0);
  assert.equal(D.dosesForDay(medicine, '2026-11-01').length, 2);
  assert.equal(D.dosesForDay(medicine, '2026-11-02').length, 2);
  assert.equal(D.dosesForDay(null, '2026-11-02').length, 0);
  assert.equal(D.dosesForDay(medicine, 'not-a-date').length, 0);
});

test('buildSchedule merges the log, sorts by time, and flags overdue pending doses', () => {
  const { list } = D.addMedicine([], MED);
  const med = list[0];
  const key0800 = D.doseKey(med.id, '2026-11-02', '08:00');
  const log = { [key0800]: { status: 'taken', at: '2026-11-02T08:05:00.000Z' } };
  // 09:00 now: 08:00 dose logged taken, 20:00 still pending and not overdue
  const sched = D.buildSchedule(list, '2026-11-02', log, 9 * 60);
  assert.equal(sched.length, 2);
  assert.equal(sched[0].time, '08:00');
  assert.equal(sched[0].status, 'taken');
  assert.equal(sched[1].status, 'pending');
  assert.equal(sched[1].overdue, false);
  // 21:00 now: the 20:00 dose is pending and overdue
  const late = D.buildSchedule(list, '2026-11-02', {}, 21 * 60);
  assert.equal(late[1].overdue, true);
  assert.equal(late[0].overdue, true);
  // unknown status values in a corrupt log are treated as pending, never crash
  const corrupt = D.buildSchedule(list, '2026-11-02', { [key0800]: { status: 'cured!' } }, null);
  assert.equal(corrupt[0].status, 'pending');
});

test('markDose accepts only known keys and valid statuses', () => {
  const { list } = D.addMedicine([], MED);
  const med = list[0];
  const key = D.doseKey(med.id, '2026-11-02', '08:00');
  const known = new Set([key, D.doseKey(med.id, '2026-11-02', '20:00')]);

  const ok = D.markDose({}, key, 'taken', known);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.log[key].status, 'taken');

  assert.ok(D.markDose({}, key, 'cured', known).errors.length > 0);
  assert.ok(D.markDose({}, 'badkey', 'taken', known).errors.length > 0);
  assert.ok(D.markDose({}, D.doseKey(med.id, '2026-11-03', '08:00'), 'taken', known).errors.length > 0,
    'a dose from another date must not be loggable against this date\'s key set');
  // without a known-key set, format-valid keys are accepted (caller-side check)
  assert.deepEqual(D.markDose({}, key, 'missed').errors, []);
});

test('adherence counts exactly and reports both rates', () => {
  const r1 = D.addMedicine([], { ...MED, times: ['08:00', '20:00'] });
  const r2 = D.addMedicine(r1.list, { name: 'Vitamin D', dose: '1 tablet', times: ['09:00'], startDate: '2026-11-01' });
  const meds = r2.list;
  // 3 days x (2 + 1) = 9 scheduled
  let log = {};
  const keys = [];
  for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) {
    for (const m of meds) for (const d of D.dosesForDay(m, day)) keys.push(d.key);
  }
  assert.equal(keys.length, 9);
  keys.slice(0, 6).forEach((k) => { log = D.markDose(log, k, 'taken').log; });
  log = D.markDose(log, keys[6], 'missed').log;
  log = D.markDose(log, keys[7], 'skipped').log;
  // keys[8] stays pending
  const a = D.adherence(meds, log, '2026-11-01', '2026-11-03');
  assert.deepEqual(
    { scheduled: a.scheduled, taken: a.taken, missed: a.missed, skipped: a.skipped, pending: a.pending },
    { scheduled: 9, taken: 6, missed: 1, skipped: 1, pending: 1 },
  );
  assert.equal(a.rate, 6 / 9);
  assert.equal(a.decidedRate, 6 / 8);
  // empty range: no doses, both rates null (not 0, not 100)
  const empty = D.adherence(meds, {}, '2026-10-01', '2026-10-03');
  assert.equal(empty.scheduled, 0);
  assert.equal(empty.rate, null);
  assert.equal(empty.decidedRate, null);
});

/* ---------------- symptoms ---------------- */
test('validateSymptom rejects severity outside 0–10 and other bad input', () => {
  const base = { name: 'Headache', severity: 5, date: '2026-11-02', note: '' };
  assert.deepEqual(D.validateSymptom(base), []);
  assert.ok(D.validateSymptom({ ...base, severity: 11 }).length > 0);
  assert.ok(D.validateSymptom({ ...base, severity: -1 }).length > 0);
  assert.ok(D.validateSymptom({ ...base, severity: NaN }).length > 0);
  assert.ok(D.validateSymptom({ ...base, severity: '5' }).length > 0);
  assert.ok(D.validateSymptom({ ...base, name: '' }).length > 0);
  assert.ok(D.validateSymptom({ ...base, date: '2026-02-30' }).length > 0);
  assert.ok(D.validateSymptom({ ...base, severity: 0 }).length === 0);
  assert.ok(D.validateSymptom({ ...base, severity: 10 }).length === 0);
});

test('addSymptom / deleteSymptom round-trip', () => {
  const r = D.addSymptom([], { name: 'Headache', severity: 6, date: '2026-11-02', note: 'after lunch' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.log.length, 1);
  assert.equal(r.entry.severity, 6);
  const bad = D.addSymptom(r.log, { name: 'X', severity: 99, date: '2026-11-02' });
  assert.ok(bad.errors.length > 0);
  assert.equal(bad.log.length, 1);
  assert.deepEqual(D.deleteSymptom(r.log, r.entry.id), { log: [], deleted: true });
  assert.equal(D.deleteSymptom(r.log, 'nope').deleted, false);
});

test('dailyMeans averages per day and leaves gaps as null', () => {
  const log = [
    { name: 'Headache', severity: 4, date: '2026-11-01' },
    { name: 'Headache', severity: 6, date: '2026-11-01' },
    { name: 'Fatigue', severity: 8, date: '2026-11-03' },
  ];
  const daily = D.dailyMeans(log, '2026-11-03', 3);
  assert.deepEqual(daily, [
    { date: '2026-11-01', mean: 5, count: 2 },
    { date: '2026-11-02', mean: null, count: 0 },
    { date: '2026-11-03', mean: 8, count: 1 },
  ]);
});

test('trendSlope recovers a known slope and returns null with too little data', () => {
  // severity rising exactly 1 point/day
  const rising = [0, 1, 2, 3, 4].map((v, i) => ({ date: `2026-11-0${i + 1}`, mean: v, count: 1 }));
  const s = D.trendSlope(rising);
  assert.ok(Math.abs(s.slope - 1) < 0.0001, `expected slope 1, got ${s.slope}`);
  assert.equal(s.n, 5);
  const flat = [5, 5, 5].map((v, i) => ({ date: `2026-11-0${i + 1}`, mean: v, count: 1 }));
  assert.ok(Math.abs(D.trendSlope(flat).slope) < 0.0001);
  assert.equal(D.trendSlope([{ date: '2026-11-01', mean: 5, count: 1 }]), null);
  assert.equal(D.trendSlope([]), null);
  // gaps (null days) are ignored, not treated as zero
  const gappy = [
    { date: '2026-11-01', mean: 2, count: 1 },
    { date: '2026-11-02', mean: null, count: 0 },
    { date: '2026-11-03', mean: 4, count: 1 },
  ];
  assert.ok(Math.abs(D.trendSlope(gappy).slope - 1) < 0.0001);
});

test('severityStats summarises correctly and handles an empty log', () => {
  assert.deepEqual(D.severityStats([]), { count: 0, mean: null, min: null, max: null });
  assert.deepEqual(D.severityStats([{ severity: 2 }, { severity: 8 }, { severity: 5 }]),
    { count: 3, mean: 5, min: 2, max: 8 });
});

/* ---------------- export ---------------- */
test('CSV export quotes commas/quotes and keeps the header first', () => {
  const { list } = D.addMedicine([], { ...MED, name: 'Aspirin, "low-dose"', dose: '75 mg' });
  const csv = D.medicinesToCSV(list);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'name,dose,times,start_date,notes');
  assert.ok(lines[1].includes('"Aspirin, ""low-dose"""'), lines[1]);
  assert.ok(csv.endsWith('\n'));

  const symCsv = D.symptomsToCSV([
    { name: 'Cough', severity: 3, date: '2026-11-03', note: '' },
    { name: 'Headache', severity: 6, date: '2026-11-01', note: 'bad, really' },
  ]);
  const symLines = symCsv.trim().split('\n');
  assert.equal(symLines[0], 'date,symptom,severity_0_to_10,note');
  assert.ok(symLines[1].startsWith('2026-11-01,Headache,6,"bad, really"'), symLines[1]);
  assert.ok(symLines[2].startsWith('2026-11-03,Cough,3,'), symLines[2]);
});

test('dosesToCSV lists every scheduled dose with its status', () => {
  const { list } = D.addMedicine([], MED);
  const med = list[0];
  let log = {};
  log = D.markDose(log, D.doseKey(med.id, '2026-11-01', '08:00'), 'taken').log;
  const csv = D.dosesToCSV(list, log, '2026-11-01', '2026-11-01');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'date,time,medicine,dose,status');
  assert.equal(lines.length, 3); // header + 2 doses
  assert.ok(lines[1].endsWith(',taken'));
  assert.ok(lines[2].endsWith(',pending'));
});

test('buildSummary states the disclaimer and the real counts', () => {
  const { list } = D.addMedicine([], MED);
  const med = list[0];
  let log = {};
  log = D.markDose(log, D.doseKey(med.id, '2026-11-01', '08:00'), 'taken').log;
  const symptoms = [{ name: 'Headache', severity: 6, date: '2026-11-01', note: '' }];
  const text = D.buildSummary(list, log, symptoms, '2026-11-01', '2026-11-01');
  assert.ok(text.includes('not medical advice'), text);
  assert.ok(text.includes('does not diagnose'), text);
  assert.ok(text.includes('Paracetamol — 500 mg'), text);
  assert.ok(text.includes('Scheduled doses: 2'), text);
  assert.ok(text.includes('Taken: 1'), text);
  assert.ok(text.includes('50.0%'), text);
  assert.ok(text.includes('Headache: 6/10'), text);
});
