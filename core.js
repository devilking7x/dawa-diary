'use strict';
/**
 * DawaDiary — core logic (pure functions, no DOM, no network).
 *
 * A medicine reminder + symptom journal. Everything runs locally in the
 * browser; data is stored in localStorage only. This module is deliberately
 * framework-free and testable in plain Node.
 *
 * MEDICAL SCOPE — read this before reusing this code:
 * This module schedules reminders, records what the user says they took,
 * and computes descriptive statistics (adherence %, daily mean severity,
 * least-squares trend slope) over the user's own log. It does NOT diagnose,
 * predict risk, detect disease, recommend doses, or judge whether a
 * medicine is appropriate. Any number it produces is a summary of logged
 * data, not medical advice.
 */

const DOSE_STATUSES = ['taken', 'missed', 'skipped'];
const MAX_SEVERITY = 10;
const MIN_SEVERITY = 0;

/* ------------------------------------------------------------------ */
/* Dates and times (local calendar dates, YYYY-MM-DD)                  */
/* ------------------------------------------------------------------ */

function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isValidTimeStr(s) {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split('-').length ? s.split(':').map(Number) : [NaN, NaN];
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** Local YYYY-MM-DD for a Date (avoids UTC-shift bugs). */
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(now) {
  return toDateStr(now || new Date());
}

function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Inclusive list of YYYY-MM-DD from start to end. Empty list if end < start. */
function dateRange(start, end) {
  if (!isValidDateStr(start) || !isValidDateStr(end)) return [];
  const out = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 3660) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

/** Minutes since midnight for "HH:MM". NaN when invalid. */
function minutesSinceMidnight(timeStr) {
  if (!isValidTimeStr(timeStr)) return NaN;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function newId() {
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ */
/* Medicines                                                           */
/* ------------------------------------------------------------------ */

/**
 * Validate medicine input. Returns an array of error strings (empty = valid).
 * `data` fields: name (string), dose (string), times (array of "HH:MM"),
 * startDate ("YYYY-MM-DD"), notes (string, optional).
 */
function validateMedicine(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['Medicine details are missing.'];
  if (typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push('Medicine name is required.');
  } else if (data.name.trim().length > 100) {
    errors.push('Medicine name must be 100 characters or fewer.');
  }
  if (typeof data.dose !== 'string' || data.dose.trim() === '') {
    errors.push('Dose is required (for example "500 mg" or "1 tablet").');
  } else if (data.dose.trim().length > 60) {
    errors.push('Dose must be 60 characters or fewer.');
  }
  if (!Array.isArray(data.times) || data.times.length === 0) {
    errors.push('At least one daily time is required.');
  } else {
    if (data.times.length > 8) errors.push('At most 8 times per day are allowed.');
    const seen = new Set();
    for (const t of data.times) {
      if (!isValidTimeStr(t)) errors.push(`Time "${String(t)}" is not a valid HH:MM time.`);
      else if (seen.has(t)) errors.push(`Time "${t}" is listed twice.`);
      seen.add(t);
    }
  }
  if (!isValidDateStr(data.startDate)) {
    errors.push('Start date must be a valid date (YYYY-MM-DD).');
  }
  if (data.notes !== undefined && typeof data.notes !== 'string') {
    errors.push('Notes must be text.');
  } else if (typeof data.notes === 'string' && data.notes.length > 500) {
    errors.push('Notes must be 500 characters or fewer.');
  }
  return errors;
}

function createMedicine(data) {
  const errors = validateMedicine(data);
  if (errors.length > 0) return { medicine: null, errors };
  const medicine = {
    id: newId(),
    name: data.name.trim(),
    dose: data.dose.trim(),
    times: [...new Set(data.times)].sort(),
    startDate: data.startDate,
    notes: (data.notes || '').trim(),
    createdAt: new Date().toISOString(),
  };
  return { medicine, errors: [] };
}

/** Returns { list, medicine, errors }. Does not mutate the input list. */
function addMedicine(list, data) {
  const safeList = Array.isArray(list) ? list : [];
  const { medicine, errors } = createMedicine(data);
  if (errors.length > 0) return { list: safeList, medicine: null, errors };
  return { list: [...safeList, medicine], medicine, errors: [] };
}

/** Returns { list, medicine, errors }. `patch` may change name/dose/times/startDate/notes. */
function updateMedicine(list, id, patch) {
  const safeList = Array.isArray(list) ? list : [];
  const idx = safeList.findIndex((m) => m.id === id);
  if (idx === -1) return { list: safeList, medicine: null, errors: ['Medicine not found.'] };
  const merged = { ...safeList[idx], ...patch, id: safeList[idx].id };
  const errors = validateMedicine(merged);
  if (errors.length > 0) return { list: safeList, medicine: null, errors };
  const medicine = {
    ...merged,
    name: merged.name.trim(),
    dose: merged.dose.trim(),
    times: [...new Set(merged.times)].sort(),
    notes: (merged.notes || '').trim(),
  };
  const next = [...safeList];
  next[idx] = medicine;
  return { list: next, medicine, errors: [] };
}

/** Returns { list, deleted }. Removing a medicine never deletes dose-log history. */
function deleteMedicine(list, id) {
  const safeList = Array.isArray(list) ? list : [];
  const next = safeList.filter((m) => m.id !== id);
  return { list: next, deleted: next.length !== safeList.length };
}

/* ------------------------------------------------------------------ */
/* Dose schedule + dose log                                            */
/* ------------------------------------------------------------------ */

function doseKey(medicineId, dateStr, time) {
  return `${medicineId}|${dateStr}|${time}`;
}

/** Doses due for one medicine on one date. [] when the date is before startDate. */
function dosesForDay(medicine, dateStr) {
  if (!medicine || !isValidDateStr(dateStr)) return [];
  if (dateStr < medicine.startDate) return [];
  return medicine.times.map((time) => ({
    key: doseKey(medicine.id, dateStr, time),
    medicineId: medicine.id,
    medicineName: medicine.name,
    dose: medicine.dose,
    date: dateStr,
    time,
  }));
}

/**
 * Full schedule for a date, with each dose's recorded status.
 * `doseLog` maps doseKey -> { status: 'taken'|'missed'|'skipped', at: ISO string }.
 * `nowMinutes` (optional) marks a due dose as 'overdue' when its time has passed.
 * Status is 'pending' when nothing is logged yet.
 */
function buildSchedule(medicines, dateStr, doseLog, nowMinutes) {
  const log = doseLog && typeof doseLog === 'object' ? doseLog : {};
  const doses = [];
  for (const med of Array.isArray(medicines) ? medicines : []) {
    for (const dose of dosesForDay(med, dateStr)) {
      const entry = log[dose.key];
      const status = entry && DOSE_STATUSES.includes(entry.status) ? entry.status : 'pending';
      const mins = minutesSinceMidnight(dose.time);
      const overdue =
        status === 'pending' &&
        Number.isInteger(nowMinutes) &&
        Number.isFinite(mins) &&
        mins < nowMinutes;
      doses.push({ ...dose, status, overdue: Boolean(overdue), loggedAt: entry ? entry.at || null : null });
    }
  }
  doses.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return doses;
}

/**
 * Record a dose outcome. Returns { log, errors }.
 * Unknown medicine/time combinations are rejected: only keys that exist in
 * the schedule for that date may be logged (pass `knownKeys`, a Set, when
 * the caller has it; when omitted, the key format itself is validated).
 */
function markDose(doseLog, key, status, knownKeys) {
  const log = doseLog && typeof doseLog === 'object' ? { ...doseLog } : {};
  if (typeof key !== 'string' || key.split('|').length !== 3) {
    return { log, errors: ['Dose key is not valid.'] };
  }
  if (!DOSE_STATUSES.includes(status)) {
    return { log, errors: [`Status must be one of: ${DOSE_STATUSES.join(', ')}.`] };
  }
  if (knownKeys && !knownKeys.has(key)) {
    return { log, errors: ['That dose is not on the schedule for its date.'] };
  }
  log[key] = { status, at: new Date().toISOString() };
  return { log, errors: [] };
}

/**
 * Adherence over a date range, in plain counts.
 * rate = taken / scheduled (all due doses, including still-pending ones).
 * decidedRate = taken / decided (taken + missed + skipped), null when nothing decided.
 * Both are reported because a "rate" that silently drops pending doses misleads.
 */
function adherence(medicines, doseLog, startDate, endDate) {
  const days = dateRange(startDate, endDate);
  const log = doseLog && typeof doseLog === 'object' ? doseLog : {};
  let scheduled = 0;
  let taken = 0;
  let missed = 0;
  let skipped = 0;
  let pending = 0;
  for (const day of days) {
    for (const med of Array.isArray(medicines) ? medicines : []) {
      for (const dose of dosesForDay(med, day)) {
        scheduled += 1;
        const entry = log[dose.key];
        const status = entry && DOSE_STATUSES.includes(entry.status) ? entry.status : 'pending';
        if (status === 'taken') taken += 1;
        else if (status === 'missed') missed += 1;
        else if (status === 'skipped') skipped += 1;
        else pending += 1;
      }
    }
  }
  const decided = taken + missed + skipped;
  return {
    days: days.length,
    scheduled,
    taken,
    missed,
    skipped,
    pending,
    rate: scheduled === 0 ? null : taken / scheduled,
    decidedRate: decided === 0 ? null : taken / decided,
  };
}

/* ------------------------------------------------------------------ */
/* Symptom journal                                                     */
/* ------------------------------------------------------------------ */

function validateSymptom(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['Symptom entry is missing.'];
  if (typeof entry.name !== 'string' || entry.name.trim() === '') {
    errors.push('Symptom name is required.');
  } else if (entry.name.trim().length > 80) {
    errors.push('Symptom name must be 80 characters or fewer.');
  }
  if (typeof entry.severity !== 'number' || !Number.isFinite(entry.severity)) {
    errors.push('Severity must be a number from 0 to 10.');
  } else if (entry.severity < MIN_SEVERITY || entry.severity > MAX_SEVERITY) {
    errors.push(`Severity must be between ${MIN_SEVERITY} and ${MAX_SEVERITY}.`);
  }
  if (!isValidDateStr(entry.date)) errors.push('Date must be a valid date (YYYY-MM-DD).');
  if (entry.note !== undefined && typeof entry.note !== 'string') {
    errors.push('Note must be text.');
  } else if (typeof entry.note === 'string' && entry.note.length > 500) {
    errors.push('Note must be 500 characters or fewer.');
  }
  return errors;
}

/** Returns { log, entry, errors }. `log` is an array, newest last. */
function addSymptom(log, data) {
  const safeLog = Array.isArray(log) ? log : [];
  const errors = validateSymptom(data);
  if (errors.length > 0) return { log: safeLog, entry: null, errors };
  const entry = {
    id: newId(),
    name: data.name.trim(),
    severity: data.severity,
    date: data.date,
    note: (data.note || '').trim(),
    createdAt: new Date().toISOString(),
  };
  return { log: [...safeLog, entry], entry, errors: [] };
}

function deleteSymptom(log, id) {
  const safeLog = Array.isArray(log) ? log : [];
  const next = safeLog.filter((e) => e.id !== id);
  return { log: next, deleted: next.length !== safeLog.length };
}

/**
 * Daily mean severity over the last `days` days ending on `endDateStr`.
 * Returns [{ date, mean (null when no entries), count }]. Mean is rounded
 * to 2 decimals. Descriptive only — it is not a diagnosis or a risk score.
 */
function dailyMeans(symptoms, endDateStr, days) {
  const n = Number.isInteger(days) && days > 0 ? days : 14;
  const end = isValidDateStr(endDateStr) ? endDateStr : todayStr();
  const start = addDays(end, -(n - 1));
  const range = dateRange(start, end);
  const byDate = new Map();
  for (const e of Array.isArray(symptoms) ? symptoms : []) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e.severity);
  }
  return range.map((date) => {
    const values = byDate.get(date) || [];
    if (values.length === 0) return { date, mean: null, count: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    return { date, mean: Math.round((sum / values.length) * 100) / 100, count: values.length };
  });
}

/**
 * Least-squares slope of daily mean severity vs day index (0 = first day).
 * Returns { slope, intercept, n } or null when fewer than 2 days have data.
 * Slope unit: severity points per day. A slope is a description of logged
 * numbers, not a prediction about future health.
 */
function trendSlope(daily) {
  const pts = (Array.isArray(daily) ? daily : [])
    .map((d, i) => ({ x: i, y: d.mean }))
    .filter((p) => typeof p.y === 'number' && Number.isFinite(p.y));
  if (pts.length < 2) return null;
  const n = pts.length;
  const meanX = pts.reduce((a, p) => a + p.x, 0) / n;
  const meanY = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope: Math.round(slope * 10000) / 10000, intercept: Math.round((meanY - slope * meanX) * 100) / 100, n };
}

function severityStats(symptoms) {
  const values = (Array.isArray(symptoms) ? symptoms : [])
    .map((e) => e.severity)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return { count: 0, mean: null, min: null, max: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    mean: Math.round((sum / values.length) * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/* ------------------------------------------------------------------ */
/* Export (CSV + plain-text summary for a doctor visit)                */
/* ------------------------------------------------------------------ */

function escapeCsv(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function medicinesToCSV(medicines) {
  const rows = [['name', 'dose', 'times', 'start_date', 'notes']];
  for (const m of Array.isArray(medicines) ? medicines : []) {
    rows.push([m.name, m.dose, (m.times || []).join(';'), m.startDate, m.notes || '']);
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

function dosesToCSV(medicines, doseLog, startDate, endDate) {
  const rows = [['date', 'time', 'medicine', 'dose', 'status']];
  const log = doseLog && typeof doseLog === 'object' ? doseLog : {};
  for (const day of dateRange(startDate, endDate)) {
    for (const med of Array.isArray(medicines) ? medicines : []) {
      for (const dose of dosesForDay(med, day)) {
        const entry = log[dose.key];
        const status = entry && DOSE_STATUSES.includes(entry.status) ? entry.status : 'pending';
        rows.push([day, dose.time, med.name, med.dose, status]);
      }
    }
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

function symptomsToCSV(symptoms) {
  const rows = [['date', 'symptom', 'severity_0_to_10', 'note']];
  const sorted = [...(Array.isArray(symptoms) ? symptoms : [])].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const e of sorted) rows.push([e.date, e.name, e.severity, e.note || '']);
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

/**
 * Plain-text summary a user can print or show a doctor. It lists what was
 * logged — medicines, adherence counts, symptom entries — and states plainly
 * that it is a log, not medical advice and not a diagnosis.
 */
function buildSummary(medicines, doseLog, symptoms, startDate, endDate) {
  const adh = adherence(medicines, doseLog, startDate, endDate);
  const stats = severityStats((Array.isArray(symptoms) ? symptoms : []).filter((e) => e.date >= startDate && e.date <= endDate));
  const lines = [];
  lines.push('DAWADIARY — MEDICINE & SYMPTOM SUMMARY');
  lines.push(`Period: ${startDate} to ${endDate}`);
  lines.push('');
  lines.push('This is a personal log kept by the user. It is not medical advice');
  lines.push('and it does not diagnose anything. Please discuss it with a doctor.');
  lines.push('');
  lines.push('MEDICINES');
  if (!medicines || medicines.length === 0) lines.push('- None recorded.');
  for (const m of medicines || []) {
    lines.push(`- ${m.name} — ${m.dose} — at ${(m.times || []).join(', ')} — from ${m.startDate}${m.notes ? ` — ${m.notes}` : ''}`);
  }
  lines.push('');
  lines.push('ADHERENCE (from the dose log)');
  lines.push(`- Scheduled doses: ${adh.scheduled}`);
  lines.push(`- Taken: ${adh.taken} | Missed: ${adh.missed} | Skipped: ${adh.skipped} | Still pending: ${adh.pending}`);
  lines.push(
    `- Taken / scheduled: ${adh.rate === null ? 'n/a (no doses scheduled)' : `${(adh.rate * 100).toFixed(1)}%`}`,
  );
  lines.push('');
  lines.push('SYMPTOMS (user-logged severity 0–10)');
  lines.push(`- Entries: ${stats.count}${stats.count > 0 ? ` | Mean severity: ${stats.mean} | Range: ${stats.min}–${stats.max}` : ''}`);
  const inRange = (Array.isArray(symptoms) ? symptoms : [])
    .filter((e) => e.date >= startDate && e.date <= endDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (inRange.length === 0) lines.push('- None recorded in this period.');
  for (const e of inRange) {
    lines.push(`- ${e.date} — ${e.name}: ${e.severity}/10${e.note ? ` — ${e.note}` : ''}`);
  }
  lines.push('');
  lines.push('Generated locally by DawaDiary. No data leaves this device.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

const api = {
  DOSE_STATUSES,
  MAX_SEVERITY,
  MIN_SEVERITY,
  isValidDateStr,
  isValidTimeStr,
  toDateStr,
  todayStr,
  addDays,
  dateRange,
  minutesSinceMidnight,
  validateMedicine,
  createMedicine,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  doseKey,
  dosesForDay,
  buildSchedule,
  markDose,
  adherence,
  validateSymptom,
  addSymptom,
  deleteSymptom,
  dailyMeans,
  trendSlope,
  severityStats,
  escapeCsv,
  medicinesToCSV,
  dosesToCSV,
  symptomsToCSV,
  buildSummary,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.DawaDiary = api;
}
