'use strict';
/* DawaDiary — browser UI wiring. All logic lives in core.js (window.DawaDiary).
 * Data is stored only in this browser's localStorage. Nothing is uploaded. */
(function () {
  const D = window.DawaDiary;
  if (!D) {
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px;color:red">Error: core.js failed to load.</p>');
    return;
  }

  const STORE_KEY = 'dawa-diary-v1';
  const PRESET_TIMES = ['06:00', '08:00', '09:00', '12:00', '13:00', '15:00', '18:00', '20:00', '21:00', '22:00'];

  let state = load();
  let viewDate = D.todayStr();
  let selectedTimes = new Set();
  let editingMedId = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { medicines: [], doseLog: {}, symptoms: [] };
      const parsed = JSON.parse(raw);
      return {
        medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
        doseLog: parsed.doseLog && typeof parsed.doseLog === 'object' ? parsed.doseLog : {},
        symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms : [],
      };
    } catch (e) {
      return { medicines: [], doseLog: {}, symptoms: [] };
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full or unavailable (private mode): the page still works for the session.
      console.warn('DawaDiary: could not save to localStorage', e);
    }
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function showError(el, messages) {
    if (!messages || messages.length === 0) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = messages.join(' ');
  }
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- Tabs ---------------- */
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => { t.classList.remove('active'); t.removeAttribute('aria-current'); });
      tab.classList.add('active');
      tab.setAttribute('aria-current', 'page');
      document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
      $('tab-' + tab.dataset.tab).classList.remove('hidden');
      if (tab.dataset.tab === 'summary') renderSummary();
      if (tab.dataset.tab === 'symptoms') renderSymptoms();
    });
  });
  function goToTab(name) {
    const tab = tabs.find((t) => t.dataset.tab === name);
    if (tab) tab.click();
  }

  /* ---------------- Today ---------------- */
  function renderToday() {
    $('today-date').textContent = viewDate;
    const now = new Date();
    const nowMinutes = viewDate === D.todayStr() ? now.getHours() * 60 + now.getMinutes() : null;
    const schedule = D.buildSchedule(state.medicines, viewDate, state.doseLog, nowMinutes);
    const knownKeys = new Set(schedule.map((d) => d.key));

    const taken = schedule.filter((d) => d.status === 'taken').length;
    const missed = schedule.filter((d) => d.status === 'missed').length;
    const pending = schedule.filter((d) => d.status === 'pending').length;
    $('today-stats').innerHTML =
      `<div class="stat"><b>${schedule.length}</b><span>scheduled</span></div>` +
      `<div class="stat"><b>${taken}</b><span>taken</span></div>` +
      `<div class="stat"><b>${missed}</b><span>missed</span></div>` +
      `<div class="stat"><b>${pending}</b><span>still pending</span></div>`;

    const list = $('schedule-list');
    $('schedule-empty').hidden = schedule.length !== 0;
    list.innerHTML = schedule.map((d) => {
      const badge = d.status === 'pending' && d.overdue
        ? '<span class="badge overdue">overdue</span>'
        : `<span class="badge ${d.status}">${d.status}</span>`;
      const actions = d.status === 'pending'
        ? `<span class="dose-actions">
             <button type="button" class="btn small primary" data-mark="taken" data-key="${esc(d.key)}">Taken ✓</button>
             <button type="button" class="btn small" data-mark="missed" data-key="${esc(d.key)}">Missed</button>
             <button type="button" class="btn small" data-mark="skipped" data-key="${esc(d.key)}">Skipped</button>
           </span>`
        : `<span class="dose-actions"><button type="button" class="btn small" data-mark="pending" data-key="${esc(d.key)}">Undo</button></span>`;
      return `<li>
        <span><span class="dose-time">${esc(d.time)}</span><br>
        <span class="dose-name">${esc(d.medicineName)}</span>
        <span class="dose-meta"> — ${esc(d.dose)}</span></span>
        <span>${badge}</span>${actions}
      </li>`;
    }).join('');

    list.querySelectorAll('[data-mark]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const mark = btn.dataset.mark;
        if (mark === 'pending') {
          const next = { ...state.doseLog };
          delete next[key];
          state.doseLog = next;
        } else {
          const res = D.markDose(state.doseLog, key, mark, knownKeys);
          if (res.errors.length > 0) { alert(res.errors.join(' ')); return; }
          state.doseLog = res.log;
        }
        save();
        renderToday();
      });
    });
  }

  $('prev-day').addEventListener('click', () => { viewDate = D.addDays(viewDate, -1); renderToday(); });
  $('next-day').addEventListener('click', () => { viewDate = D.addDays(viewDate, 1); renderToday(); });
  $('today-btn').addEventListener('click', () => { viewDate = D.todayStr(); renderToday(); });

  /* ---------------- Medicines ---------------- */
  function renderTimePicks() {
    const box = $('med-times');
    const all = [...new Set([...PRESET_TIMES, ...selectedTimes])].sort();
    box.innerHTML = all.map((t) =>
      `<button type="button" class="time-pick" data-time="${t}" aria-pressed="${selectedTimes.has(t)}">${t}</button>`,
    ).join('') +
    `<span class="inline-fields"><input type="time" id="med-custom-time" aria-label="Custom time">
     <button type="button" class="btn small" id="med-add-time">+ Add time</button></span>`;
    box.querySelectorAll('.time-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.time;
        if (selectedTimes.has(t)) selectedTimes.delete(t); else selectedTimes.add(t);
        renderTimePicks();
      });
    });
    $('med-add-time').addEventListener('click', () => {
      const v = $('med-custom-time').value;
      if (D.isValidTimeStr(v)) { selectedTimes.add(v); renderTimePicks(); }
      else { alert('Pick a valid time first.'); }
    });
  }

  function renderMedicines() {
    const list = $('medicine-list');
    $('medicine-empty').hidden = state.medicines.length !== 0;
    list.innerHTML = state.medicines.map((m) =>
      `<li>
        <span><span class="dose-name">${esc(m.name)}</span>
        <span class="dose-meta"> — ${esc(m.dose)} — at ${esc((m.times || []).join(', '))} — from ${esc(m.startDate)}${m.notes ? `<br>${esc(m.notes)}` : ''}</span></span>
        <span class="dose-actions">
          <button type="button" class="btn small" data-edit="${esc(m.id)}">Edit</button>
          <button type="button" class="btn small danger" data-del="${esc(m.id)}">Delete</button>
        </span>
      </li>`,
    ).join('');
    list.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => startEdit(btn.dataset.edit));
    });
    list.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const med = state.medicines.find((m) => m.id === btn.dataset.del);
        if (!med) return;
        if (!confirm(`Delete ${med.name}? Your dose-log history is kept.`)) return;
        state.medicines = D.deleteMedicine(state.medicines, med.id).list;
        save();
        renderMedicines();
        renderToday();
      });
    });
  }

  function resetMedicineForm() {
    editingMedId = null;
    $('med-id').value = '';
    $('med-name').value = '';
    $('med-dose').value = '';
    $('med-start').value = D.todayStr();
    $('med-notes').value = '';
    selectedTimes = new Set();
    $('medicine-form-title').textContent = 'Add a medicine';
    $('med-submit').textContent = 'Add medicine';
    $('med-cancel').hidden = true;
    showError($('med-error'), []);
    renderTimePicks();
  }

  function startEdit(id) {
    const med = state.medicines.find((m) => m.id === id);
    if (!med) return;
    editingMedId = id;
    $('med-id').value = id;
    $('med-name').value = med.name;
    $('med-dose').value = med.dose;
    $('med-start').value = med.startDate;
    $('med-notes').value = med.notes || '';
    selectedTimes = new Set(med.times || []);
    $('medicine-form-title').textContent = 'Edit medicine';
    $('med-submit').textContent = 'Save changes';
    $('med-cancel').hidden = false;
    showError($('med-error'), []);
    renderTimePicks();
    goToTab('medicines');
    $('med-name').focus();
  }

  $('med-cancel').addEventListener('click', resetMedicineForm);

  $('medicine-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: $('med-name').value,
      dose: $('med-dose').value,
      times: [...selectedTimes].sort(),
      startDate: $('med-start').value,
      notes: $('med-notes').value,
    };
    let res;
    if (editingMedId) {
      res = D.updateMedicine(state.medicines, editingMedId, data);
      if (res.errors.length === 0) state.medicines = res.list;
      showError($('med-error'), res.errors);
    } else {
      res = D.addMedicine(state.medicines, data);
      if (res.errors.length === 0) state.medicines = res.list;
      showError($('med-error'), res.errors);
    }
    if (res.errors.length > 0) return;
    save();
    resetMedicineForm();
    renderMedicines();
    renderToday();
  });

  /* ---------------- Symptoms ---------------- */
  $('sym-severity').addEventListener('input', (e) => {
    $('sym-severity-value').textContent = `${e.target.value} / 10`;
  });

  function renderSymptoms() {
    const daily = D.dailyMeans(state.symptoms, D.todayStr(), 14);
    const slope = D.trendSlope(daily);
    const svg = $('trend-chart');
    const W = 560, H = 220, padL = 34, padB = 26, padT = 14;
    const chartW = W - padL - 8, chartH = H - padT - padB;
    const bw = chartW / 14;
    let parts = [];
    // gridlines for 0, 5, 10
    [0, 5, 10].forEach((v) => {
      const y = padT + chartH - (v / 10) * chartH;
      parts.push(`<line x1="${padL}" y1="${y}" x2="${W - 8}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
      parts.push(`<text x="${padL - 6}" y="${y + 4}" font-size="11" fill="#5b6b66" text-anchor="end">${v}</text>`);
    });
    daily.forEach((d, i) => {
      const x = padL + i * bw + 2;
      if (typeof d.mean === 'number') {
        const h = (d.mean / 10) * chartH;
        const y = padT + chartH - h;
        parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#0f766e"><title>${d.date}: mean ${d.mean} (${d.count} entr${d.count === 1 ? 'y' : 'ies'})</title></rect>`);
      }
      if (i % 3 === 0) {
        parts.push(`<text x="${(padL + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" font-size="10" fill="#5b6b66" text-anchor="middle">${d.date.slice(5)}</text>`);
      }
    });
    if (slope) {
      const x1 = padL, x2 = W - 8;
      const yAt = (x) => {
        const idx = (x - padL) / bw;
        const v = slope.intercept + slope.slope * idx;
        return padT + chartH - (Math.max(0, Math.min(10, v)) / 10) * chartH;
      };
      parts.push(`<line x1="${x1}" y1="${yAt(x1).toFixed(1)}" x2="${x2}" y2="${yAt(x2).toFixed(1)}" stroke="#b45309" stroke-width="2" stroke-dasharray="5 3"/>`);
    }
    svg.innerHTML = parts.join('');
    const trendText = $('trend-text');
    if (!slope) {
      trendText.textContent = 'Not enough data yet — log symptoms on at least 2 different days to see a trend.';
    } else {
      const dir = slope.slope > 0.05 ? 'rising' : slope.slope < -0.05 ? 'falling' : 'roughly flat';
      trendText.textContent = `Trend over ${slope.n} days with entries: ${dir} (${slope.slope > 0 ? '+' : ''}${slope.slope} severity points per day). This describes your log only — it is not a prediction.`;
    }

    const list = $('symptom-list');
    const sorted = [...state.symptoms].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 30);
    $('symptom-empty').hidden = state.symptoms.length !== 0;
    list.innerHTML = sorted.map((s) =>
      `<li>
        <span><span class="dose-name">${esc(s.name)}</span>
        <span class="dose-meta"> — ${esc(s.date)} — severity ${esc(s.severity)}/10${s.note ? `<br>${esc(s.note)}` : ''}</span></span>
        <span class="dose-actions"><button type="button" class="btn small danger" data-sym-del="${esc(s.id)}">Delete</button></span>
      </li>`,
    ).join('');
    list.querySelectorAll('[data-sym-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.symptoms = D.deleteSymptom(state.symptoms, btn.dataset.symDel).log;
        save();
        renderSymptoms();
      });
    });
  }

  $('symptom-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = D.addSymptom(state.symptoms, {
      name: $('sym-name').value,
      severity: Number($('sym-severity').value),
      date: $('sym-date').value,
      note: $('sym-note').value,
    });
    showError($('sym-error'), res.errors);
    if (res.errors.length > 0) return;
    state.symptoms = res.log;
    save();
    $('sym-name').value = '';
    $('sym-note').value = '';
    renderSymptoms();
  });

  /* ---------------- Summary & export ---------------- */
  function summaryRange() {
    return { start: $('sum-start').value, end: $('sum-end').value };
  }

  function renderSummary() {
    const { start, end } = summaryRange();
    if (!D.isValidDateStr(start) || !D.isValidDateStr(end) || end < start) {
      $('summary-text').textContent = 'Pick a valid period (start date on or before end date).';
      $('summary-stats').innerHTML = '';
      return;
    }
    const adh = D.adherence(state.medicines, state.doseLog, start, end);
    $('summary-stats').innerHTML =
      `<div class="stat"><b>${adh.scheduled}</b><span>scheduled doses</span></div>` +
      `<div class="stat"><b>${adh.rate === null ? '—' : (adh.rate * 100).toFixed(1) + '%'}</b><span>taken ÷ scheduled</span></div>` +
      `<div class="stat"><b>${adh.decidedRate === null ? '—' : (adh.decidedRate * 100).toFixed(1) + '%'}</b><span>taken ÷ decided</span></div>`;
    $('summary-text').textContent = D.buildSummary(state.medicines, state.doseLog, state.symptoms, start, end);
  }

  $('sum-start').addEventListener('change', renderSummary);
  $('sum-end').addEventListener('change', renderSummary);
  $('btn-print').addEventListener('click', () => { renderSummary(); window.print(); });
  $('btn-csv-meds').addEventListener('click', () => download('dawadiary-medicines.csv', D.medicinesToCSV(state.medicines), 'text/csv;charset=utf-8'));
  $('btn-csv-doses').addEventListener('click', () => {
    const { start, end } = summaryRange();
    download('dawadiary-doses.csv', D.dosesToCSV(state.medicines, state.doseLog, start, end), 'text/csv;charset=utf-8');
  });
  $('btn-csv-symptoms').addEventListener('click', () => download('dawadiary-symptoms.csv', D.symptomsToCSV(state.symptoms), 'text/csv;charset=utf-8'));
  $('btn-wipe').addEventListener('click', () => {
    if (!confirm('Delete ALL DawaDiary data on this device (medicines, dose log, symptoms)? This cannot be undone.')) return;
    state = { medicines: [], doseLog: {}, symptoms: [] };
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    viewDate = D.todayStr();
    resetMedicineForm();
    renderAll();
  });

  /* ---------------- Init ---------------- */
  function renderAll() {
    renderToday();
    renderMedicines();
    renderSymptoms();
    renderSummary();
  }

  $('med-start').value = D.todayStr();
  $('sym-date').value = D.todayStr();
  $('sum-end').value = D.todayStr();
  $('sum-start').value = D.addDays(D.todayStr(), -13);
  renderTimePicks();
  renderAll();
})();
