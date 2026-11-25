'use strict';

/* =====================================================================
   GoldenCare – Elderly Health Maintenance Tracker (frontend)
   ===================================================================== */

// ---------- Helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
const nowHM = () => new Date().toTimeString().slice(0, 5); // HH:MM
const toMinutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
function fmtTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function toLocalInput(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ---------- API ----------
async function request(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const api = {
  get: (u) => request(u),
  post: (u, b) => request(u, { method: 'POST', body: JSON.stringify(b) }),
  put: (u, b) => request(u, { method: 'PUT', body: JSON.stringify(b) }),
  del: (u) => request(u, { method: 'DELETE' }),
};

// Optional `actionHtml` adds a button (e.g. Undo) to the toast
function toast(msg, type = 'success', actionHtml = '') {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actionHtml}`;
  t.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = 'toast'), actionHtml ? 8000 : 3500);
}
const hideToast = () => ($('#toast').className = 'toast');

// Items shown on the current page, so Edit can open them without refetching
const cache = new Map();
const remember = (items) => items.forEach((i) => cache.set(i._id, i));

// Caregiver "viewing as" selection – limits dashboard and reminders to their elders
const viewer = {
  get id() { return store.get('gc-viewer', ''); },
  set(id) { store.set('gc-viewer', id || ''); },
};
const viewerQuery = () => (viewer.id ? `&caregiver=${encodeURIComponent(viewer.id)}` : '');

// ---------- Resource definitions (drive the add/edit forms) ----------
const RESOURCES = {
  elders: {
    endpoint: '/api/elders',
    singular: 'Elder',
    fields: [
      { name: 'name', label: 'Full name', required: true },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
      { name: 'gender', label: 'Gender', type: 'select', options: ['', 'Female', 'Male', 'Other'] },
      { name: 'bloodType', label: 'Blood type', type: 'select', options: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'address', label: 'Address' },
      { name: 'conditions', label: 'Health conditions', type: 'list', hint: 'Separate with commas, e.g. Hypertension, Diabetes' },
      { name: 'allergies', label: 'Allergies', type: 'list', hint: 'Separate with commas' },
      { name: 'emergencyContactName', label: 'Emergency contact name' },
      { name: 'emergencyContactPhone', label: 'Emergency contact phone', type: 'tel' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  vitals: {
    endpoint: '/api/vitals',
    singular: 'Vital signs reading',
    fields: [
      { name: 'recordedAt', label: 'Date and time', type: 'datetime-local', required: true, default: () => new Date().toISOString() },
      { name: 'systolic', label: 'Blood pressure – systolic (mmHg)', type: 'number', min: 50, max: 260, placeholder: 'e.g. 120' },
      { name: 'diastolic', label: 'Blood pressure – diastolic (mmHg)', type: 'number', min: 30, max: 160, placeholder: 'e.g. 80' },
      { name: 'heartRate', label: 'Heart rate (beats/min)', type: 'number', min: 20, max: 250, placeholder: 'e.g. 72' },
      { name: 'temperature', label: 'Temperature (°C)', type: 'number', step: 0.1, min: 30, max: 45, placeholder: 'e.g. 36.6' },
      { name: 'oxygen', label: 'Oxygen saturation SpO₂ (%)', type: 'number', min: 50, max: 100, placeholder: 'e.g. 97' },
      { name: 'bloodSugar', label: 'Blood sugar (mg/dL)', type: 'number', min: 20, max: 600, placeholder: 'optional' },
      { name: 'weight', label: 'Weight (kg)', type: 'number', step: 0.1, min: 20, max: 300, placeholder: 'optional' },
      { name: 'notes', label: 'Notes', type: 'textarea', hint: 'How are they feeling? Any symptoms?' },
    ],
  },
  medications: {
    endpoint: '/api/medications',
    singular: 'Medication',
    trash: true, // deleted medicines go to "Recently deleted"
    fields: [
      { name: 'name', label: 'Medicine name', required: true },
      { name: 'dosage', label: 'Dosage', required: true, placeholder: 'e.g. 500 mg, 1 tablet' },
      {
        name: 'times', label: 'Times to take (24-hour)', type: 'list', required: true, placeholder: '08:00, 20:00',
        hint: 'Separate times with commas. You will get a reminder at each time.',
        normalize: (arr) => [...new Set(arr.map((t) => t.padStart(5, '0')))].sort(),
      },
      { name: 'startDate', label: 'Start date', type: 'date', required: true, default: todayStr },
      { name: 'endDate', label: 'End date', type: 'date', hint: 'Leave empty if ongoing' },
      { name: 'instructions', label: 'Instructions', placeholder: 'e.g. Take after meals' },
      {
        name: 'bin', label: 'Storage bin (where it is kept)', type: 'ref', source: 'bins', emptyLabel: '— Not assigned —',
        optionLabel: (b) => `${b.label} – ${b.location}`, hint: 'Create bins on the Storage bins page',
      },
      { name: 'active', label: 'Currently taking this medicine', type: 'checkbox', default: true },
    ],
  },
  appointments: {
    endpoint: '/api/appointments',
    singular: 'Appointment',
    fields: [
      { name: 'title', label: 'Appointment', required: true, placeholder: 'e.g. Cardiology check-up' },
      { name: 'dateTime', label: 'Date and time', type: 'datetime-local', required: true },
      { name: 'doctor', label: 'Doctor / specialist' },
      { name: 'location', label: 'Location' },
      { name: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'Completed', 'Cancelled', 'Missed'] },
      { name: 'notes', label: 'Notes', type: 'textarea', hint: 'Questions to ask, results, follow-up…' },
    ],
  },
  records: {
    endpoint: '/api/records',
    singular: 'Health record',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: todayStr },
      { name: 'type', label: 'Type', type: 'select', options: ['Diagnosis', 'Procedure', 'Lab Result', 'Vaccination', 'Allergy', 'Hospital Visit', 'Note'] },
      { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Flu vaccine' },
      { name: 'provider', label: 'Doctor / facility' },
      { name: 'description', label: 'Details', type: 'textarea' },
    ],
  },
  bins: {
    endpoint: '/api/bins',
    singular: 'Storage bin',
    fields: [
      { name: 'label', label: 'Label code', required: true, placeholder: 'e.g. A-01', hint: 'Short code printed on the bin’s label' },
      { name: 'location', label: 'Location', required: true, placeholder: 'e.g. Nurse station – Cabinet 2, Shelf 3' },
      { name: 'color', label: 'Label colour', type: 'select', options: ['Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Gray'] },
      { name: 'elder', label: 'Belongs to (optional)', type: 'ref', source: 'elders', emptyLabel: '— Shared bin —', optionLabel: (e) => e.name },
      { name: 'description', label: 'Description', placeholder: 'e.g. Morning medicines' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  caregivers: {
    endpoint: '/api/caregivers',
    singular: 'Caregiver',
    fields: [
      { name: 'name', label: 'Full name', required: true },
      { name: 'relationship', label: 'Relationship', placeholder: 'e.g. Daughter, Nurse' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'elders', label: 'Looks after', type: 'elders' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
};

// ---------- Form dialog ----------
const dialog = $('#form-dialog');
let eldersCache = [];
const refCache = {}; // options for 'ref' dropdowns, keyed by resource

function fieldHtml(f, v) {
  const id = `fld-${f.name}`;
  const label = esc(f.label || cap(f.name));
  const req = f.required ? 'required aria-required="true"' : '';
  const star = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const hint = f.hint ? `<small id="${id}-hint">${esc(f.hint)}</small>` : '';
  const describedBy = f.hint ? `aria-describedby="${id}-hint"` : '';
  const cls = ['textarea', 'elders'].includes(f.type) || f.full ? 'field full' : 'field';

  switch (f.type) {
    case 'checkbox':
      return `<div class="field check full"><label><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}> ${label}</label></div>`;
    case 'elders': {
      const selected = (v || []).map((x) => x._id || x);
      const list = eldersCache.length
        ? `<div class="checklist">${eldersCache
            .map((e) => `<label><input type="checkbox" name="elders" value="${e._id}" ${selected.includes(e._id) ? 'checked' : ''}> ${esc(e.name)}</label>`)
            .join('')}</div>`
        : '<p class="muted">No elders added yet.</p>';
      return `<fieldset class="${cls}"><legend>${label}</legend>${list}</fieldset>`;
    }
    case 'textarea':
      return `<div class="${cls}"><label for="${id}">${label}${star}</label><textarea id="${id}" name="${f.name}" rows="3" ${req} ${describedBy}>${esc(v)}</textarea>${hint}</div>`;
    case 'ref': {
      // Dropdown of documents from another resource (e.g. storage bins)
      const options = refCache[f.source] || [];
      const selected = v && typeof v === 'object' ? v._id : v || '';
      return `<div class="${cls}"><label for="${id}">${label}${star}</label><select id="${id}" name="${f.name}" ${req} ${describedBy}><option value="">${esc(
        f.emptyLabel || '— None —'
      )}</option>${options
        .map((o) => `<option value="${o._id}" ${o._id === selected ? 'selected' : ''}>${esc(f.optionLabel ? f.optionLabel(o) : o.name)}</option>`)
        .join('')}</select>${hint}</div>`;
    }
    case 'select':
      return `<div class="${cls}"><label for="${id}">${label}${star}</label><select id="${id}" name="${f.name}" ${req}>${f.options
        .map((o) => `<option value="${esc(o)}" ${o === (v ?? '') ? 'selected' : ''}>${esc(o || '— Select —')}</option>`)
        .join('')}</select>${hint}</div>`;
    default: {
      const type = f.type === 'list' ? 'text' : f.type || 'text';
      const attrs = ['step', 'min', 'max', 'placeholder'].filter((k) => f[k] !== undefined).map((k) => `${k}="${esc(f[k])}"`).join(' ');
      const value = f.type === 'list' ? (v || []).join(', ') : f.type === 'datetime-local' ? (v ? toLocalInput(v) : '') : v;
      return `<div class="${cls}"><label for="${id}">${label}${star}</label><input id="${id}" name="${f.name}" type="${type}" value="${esc(value)}" ${attrs} ${req} ${describedBy}>${hint}</div>`;
    }
  }
}

function readForm(form, fields) {
  const body = {};
  for (const f of fields) {
    if (f.type === 'elders') {
      body.elders = [...form.querySelectorAll('input[name="elders"]:checked')].map((i) => i.value);
      continue;
    }
    const el = form.elements[f.name];
    let value;
    if (f.type === 'checkbox') value = el.checked;
    else if (f.type === 'list') value = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'ref') value = el.value || null;
    else if (f.type === 'number') value = el.value === '' ? null : Number(el.value);
    else if (f.type === 'datetime-local') value = el.value ? new Date(el.value).toISOString() : null;
    else value = el.value.trim();
    body[f.name] = f.normalize ? f.normalize(value) : value;
  }
  return body;
}

/**
 * Opens the add/edit dialog.
 *   item    – existing document to edit (omit to add)
 *   initial – starting values for a new item
 *   fixed   – values always sent but not shown (e.g. { elder: id })
 */
async function openForm(res, { item = null, initial = {}, fixed = {} } = {}) {
  const r = RESOURCES[res];
  if (r.fields.some((f) => f.type === 'elders')) eldersCache = await api.get('/api/elders');
  await Promise.all(
    r.fields.filter((f) => f.type === 'ref').map(async (f) => (refCache[f.source] = await api.get(RESOURCES[f.source].endpoint)))
  );

  const values = item || initial || {};
  const form = $('#dialog-form');
  $('#dialog-title').textContent = `${item ? 'Edit' : 'Add'} ${r.singular.toLowerCase()}`;
  form.innerHTML = `
    <div class="form-grid">
      ${r.fields
        .map((f) => {
          let v = values[f.name];
          if (!item && v === undefined && f.default !== undefined) v = typeof f.default === 'function' ? f.default() : f.default;
          return fieldHtml(f, v);
        })
        .join('')}
    </div>
    <p class="form-error" role="alert"></p>
    <div class="dialog-actions">
      <button type="button" class="btn secondary" data-close>Cancel</button>
      <button type="submit" class="btn primary">${item ? 'Save changes' : 'Add'}</button>
    </div>`;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const errorEl = form.querySelector('.form-error');
    const firstInvalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (firstInvalid) {
      const label = form.querySelector(`label[for="${firstInvalid.id}"]`)?.textContent.replace('*', '').trim() || 'A field';
      errorEl.textContent = `${label}: ${firstInvalid.validationMessage}`;
      firstInvalid.focus();
      return;
    }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const body = { ...fixed, ...readForm(form, r.fields) };
      if (item) await api.put(`${r.endpoint}/${item._id}`, body);
      else await api.post(r.endpoint, body);
      dialog.close();
      toast(`${r.singular} ${item ? 'updated' : 'added'}`);
      refresh();
      if (res === 'medications') checkReminders();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
  form.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.showModal();
  form.querySelector('input:not([type="checkbox"]), select, textarea')?.focus();
}

async function removeItem(res, id) {
  const r = RESOURCES[res];
  if (r.trash) {
    const item = cache.get(id);
    if (!confirm(`Move ${item ? `“${item.name}”` : `this ${r.singular.toLowerCase()}`} to Recently deleted?\n\nIt will stop appearing in the schedule. You can restore it within 30 days.`)) return;
    await api.del(`${r.endpoint}/${id}`);
    toast(`${r.singular} moved to Recently deleted`, 'success', `<button class="btn small secondary" data-action="restore" data-res="${res}" data-id="${id}">Undo</button>`);
    refresh();
    checkReminders();
    return;
  }
  const extra =
    res === 'elders' ? '\n\nAll of their vital signs, medications, appointments and health records will also be deleted.'
    : res === 'bins' ? '\n\nThe medicines in it are not deleted – they will just show “No bin assigned”.'
    : '';
  if (!confirm(`Delete this ${r.singular.toLowerCase()}? This cannot be undone.${extra}`)) return;
  await api.del(`${r.endpoint}/${id}`);
  toast(`${r.singular} deleted`);
  if (res === 'caregivers' && viewer.id === id) viewer.set('');
  if (res === 'elders' && location.hash.startsWith('#/elders/')) {
    location.hash = '#/elders';
    return;
  }
  refresh();
  checkReminders();
}

// ---------- Shared UI pieces ----------
const jsonAttr = (obj) => esc(JSON.stringify(obj));
const addBtn = (res, label, opts = {}) =>
  `<button class="btn primary" data-action="add" data-res="${res}"${opts.fixed ? ` data-fixed="${jsonAttr(opts.fixed)}"` : ''}${
    opts.initial ? ` data-initial="${jsonAttr(opts.initial)}"` : ''
  }>+ ${esc(label)}</button>`;
const editBtn = (res, id, what = '') => `<button class="btn small secondary" data-action="edit" data-res="${res}" data-id="${id}" aria-label="Edit ${esc(what)}">Edit</button>`;
const delBtn = (res, id, what = '') => `<button class="btn small danger" data-action="delete" data-res="${res}" data-id="${id}" aria-label="Delete ${esc(what)}">Delete</button>`;
const empty = (msg, action = '') => `<div class="empty"><p>${esc(msg)}</p>${action}</div>`;

function alertBadges(alerts, hasReading) {
  if (!hasReading) return '<span class="muted">No readings yet</span>';
  if (!alerts.length) return '<span class="badge ok">All normal</span>';
  return alerts
    .map((a) => `<span class="badge ${a.level === 'critical' ? 'danger' : a.level === 'low' ? 'info' : 'warn'}">${a.level === 'critical' ? '⚠ ' : ''}${esc(a.message)}</span>`)
    .join(' ');
}

// Storage bin label chip, and "where to find it" link
const binTag = (b) => (b ? `<span class="bin-tag c-${esc(b.color || 'Blue')}">📦 ${esc(b.label)}</span>` : '');
const binWhere = (b) =>
  b ? `<a class="bin-where" href="#/bins/${b._id}">${binTag(b)} <small>${esc(b.location)}</small></a>` : '<small class="muted">No bin assigned</small>';

function vitalSummary(v) {
  const parts = [];
  if (v.systolic != null || v.diastolic != null) parts.push(`BP ${v.systolic ?? '–'}/${v.diastolic ?? '–'}`);
  if (v.heartRate != null) parts.push(`HR ${v.heartRate}`);
  if (v.temperature != null) parts.push(`${v.temperature} °C`);
  if (v.oxygen != null) parts.push(`SpO₂ ${v.oxygen}%`);
  if (v.bloodSugar != null) parts.push(`Sugar ${v.bloodSugar}`);
  return parts.join(' · ') || '—';
}

const STATUS_CLASS = { Taken: 'ok', Skipped: 'neutral', Pending: 'warn', Scheduled: 'info', Completed: 'ok', Cancelled: 'neutral', Missed: 'danger' };
const statusBadge = (s) => `<span class="badge ${STATUS_CLASS[s] || 'neutral'}">${esc(s)}</span>`;

const doseBtn = (d, status, label, cls) =>
  `<button class="btn small ${cls}" data-action="dose" data-med="${d.medicationId}" data-date="${d.date}" data-time="${d.time}" data-status="${status}" aria-label="${esc(
    `${label.replace('✓ ', '')}: ${d.name} at ${fmtTime(d.time)}`
  )}">${label}</button>`;
const doseButtons = (d) =>
  d.date > todayStr() ? '<span class="muted">Upcoming</span>' // future doses can't be marked yet
  : d.status === 'Pending' ? doseBtn(d, 'Taken', '✓ Taken', 'success') + doseBtn(d, 'Skipped', 'Skip', 'secondary')
  : doseBtn(d, 'Pending', 'Undo', 'secondary');

function doseTable(doses, { showElder = true } = {}) {
  const isToday = doses[0]?.date === todayStr();
  const now = nowHM();
  return `<div class="table-wrap"><table>
    <thead><tr><th>Time</th>${showElder ? '<th>Elder</th>' : ''}<th>Medicine</th><th>Instructions</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${doses
      .map((d) => {
        const overdue = isToday && d.status === 'Pending' && d.time <= now;
        return `<tr class="${overdue ? 'row-overdue' : ''}">
          <td><strong>${fmtTime(d.time)}</strong></td>
          ${showElder ? `<td>${d.elder ? `<a href="#/elders/${d.elder._id}/medications">${esc(d.elder.name)}</a>` : '—'}</td>` : ''}
          <td>${esc(d.name)}<br><small class="muted">${esc(d.dosage)}</small>${d.bin ? `<br>${binWhere(d.bin)}` : ''}</td>
          <td>${esc(d.instructions || '—')}</td>
          <td>${overdue ? '<span class="badge danger">Overdue</span>' : statusBadge(d.status)}${
            d.loggedAt ? `<br><small class="muted">${new Date(d.loggedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small>` : ''
          }</td>
          <td class="row-actions">${doseButtons(d)}</td>
        </tr>`;
      })
      .join('')}</tbody></table></div>`;
}

function trendChart(readings) {
  const SERIES = [
    { key: 'systolic', label: 'Systolic BP', color: '#eb2f33' },
    { key: 'diastolic', label: 'Diastolic BP', color: '#f08a24' },
    { key: 'heartRate', label: 'Heart rate', color: '#2c99d6' },
  ];
  const series = SERIES.map((s) => ({ ...s, pts: readings.map((r, i) => [i, r[s.key]]).filter(([, v]) => v != null) })).filter((s) => s.pts.length);
  if (!series.length) return '';
  const values = series.flatMap((s) => s.pts.map(([, v]) => v));
  const min = Math.floor(Math.min(...values) - 10);
  const max = Math.ceil(Math.max(...values) + 10);
  const W = 640, H = 220, L = 42, R = 12, T = 12, B = 30, n = readings.length;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((max - v) * (H - T - B)) / (max - min);
  const grid = [0, 1, 2, 3, 4]
    .map((k) => {
      const v = Math.round(min + (k * (max - min)) / 4);
      return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity="0.12"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity="0.7">${v}</text>`;
    })
    .join('');
  const shortDate = (r) => new Date(r.recordedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const lines = series
    .map(
      (s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${s.pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}"/>
      ${s.pts.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}"><title>${s.label}: ${v} (${shortDate(readings[i])})</title></circle>`).join('')}`
    )
    .join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend of blood pressure and heart rate over the last ${n} readings">
      ${grid}${lines}
      <text x="${L}" y="${H - 8}" font-size="11" fill="currentColor" fill-opacity="0.7">${shortDate(readings[0])}</text>
      <text x="${W - R}" y="${H - 8}" font-size="11" text-anchor="end" fill="currentColor" fill-opacity="0.7">${shortDate(readings[n - 1])}</text>
    </svg>
    <figcaption>${series.map((s) => `<span><svg class="legend-dot" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="${s.color}"/></svg>${s.label}</span>`).join('')}</figcaption>
  </figure>`;
}

// =====================================================================
// Pages
// =====================================================================

// ---------- Dashboard ----------
async function renderDashboard() {
  const caregivers = await api.get('/api/caregivers');
  if (viewer.id && !caregivers.some((c) => c._id === viewer.id)) viewer.set('');
  const data = await api.get(`/api/dashboard?date=${todayStr()}${viewerQuery()}`);
  const now = nowHM();
  const weekAhead = Date.now() + 7 * 864e5;
  let attention = 0, overdueTotal = 0, dueTotal = 0, takenTotal = 0, apptSoon = 0;

  const cards = data.map(({ elder, latestVital, nextAppointment, doses }) => {
    const alerts = latestVital?.alerts || [];
    if (alerts.length) attention++;
    const taken = doses.filter((d) => d.status === 'Taken').length;
    const overdue = doses.filter((d) => d.status === 'Pending' && d.time <= now);
    const nextDose = doses.find((d) => d.status === 'Pending' && d.time > now);
    overdueTotal += overdue.length;
    dueTotal += doses.length;
    takenTotal += taken;
    if (nextAppointment && new Date(nextAppointment.dateTime) <= weekAhead) apptSoon++;
    const level = alerts.some((a) => a.level === 'critical') ? 'critical' : alerts.length ? 'warn' : '';

    return `<article class="card elder-card ${level}">
      <header><h3><a href="#/elders/${elder._id}">${esc(elder.name)}</a></h3><span class="muted">${elder.age ?? '?'} yrs</span></header>
      ${elder.conditions?.length ? `<p class="tags">${elder.conditions.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</p>` : ''}
      <dl class="mini">
        <div><dt>Latest vital signs</dt><dd>${
          latestVital ? `${vitalSummary(latestVital)}<br><small class="muted">${fmtDateTime(latestVital.recordedAt)}</small>` : '<span class="muted">None recorded</span>'
        }</dd></div>
        <div><dt>Health status</dt><dd>${alertBadges(alerts, !!latestVital)}</dd></div>
        <div><dt>Medications today</dt><dd>${
          doses.length
            ? `${taken} of ${doses.length} doses taken${overdue.length ? ` <span class="badge danger">${overdue.length} overdue</span>` : ''}${
                nextDose ? `<br><small class="muted">Next: ${esc(nextDose.name)} at ${fmtTime(nextDose.time)}</small>` : ''
              }`
            : '<span class="muted">None scheduled</span>'
        }</dd></div>
        <div><dt>Next appointment</dt><dd>${
          nextAppointment ? `${esc(nextAppointment.title)}<br><small class="muted">${fmtDateTime(nextAppointment.dateTime)}</small>` : '<span class="muted">None scheduled</span>'
        }</dd></div>
      </dl>
      <a class="btn secondary small" href="#/elders/${elder._id}">Open health record</a>
    </article>`;
  });

  const stat = (value, label, danger) => `<div class="stat ${danger ? 'danger' : ''}"><strong>${value}</strong><span>${label}</span></div>`;
  const current = caregivers.find((c) => c._id === viewer.id);

  app.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${current ? `${esc(current.name)}'s overview` : 'Dashboard'}</h2>
        <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      <label class="inline">Viewing as
        <select id="viewer-select">
          <option value="">Everyone (all elders)</option>
          ${caregivers.map((c) => `<option value="${c._id}" ${c._id === viewer.id ? 'selected' : ''}>${esc(c.name)}${c.relationship ? ` (${esc(c.relationship)})` : ''}</option>`).join('')}
        </select>
      </label>
    </div>
    <section class="stats" aria-label="Summary">
      ${stat(data.length, data.length === 1 ? 'Elder' : 'Elders')}
      ${stat(attention, 'Need attention (vital signs)', attention)}
      ${stat(`${takenTotal}/${dueTotal}`, 'Doses taken today')}
      ${stat(overdueTotal, 'Overdue doses', overdueTotal)}
      ${stat(apptSoon, 'Appointments in next 7 days')}
    </section>
    ${
      data.length
        ? `<section class="grid" aria-label="Elders">${cards.join('')}</section>`
        : `<div class="card">${
            current ? empty('No elders are linked to this caregiver yet. Edit the caregiver to choose who they look after.', '<a class="btn secondary" href="#/caregivers">Go to caregivers</a>') : empty('No elders yet. Add someone to start tracking their health.', addBtn('elders', 'Add elder'))
          }</div>`
    }`;

  $('#viewer-select').onchange = (e) => {
    viewer.set(e.target.value);
    refresh();
    checkReminders();
  };
}

// ---------- Medications today ----------
let scheduleDate = null;
async function renderToday() {
  scheduleDate = scheduleDate || todayStr();
  const doses = await api.get(`/api/medications/schedule?date=${scheduleDate}${viewerQuery()}`);
  const taken = doses.filter((d) => d.status === 'Taken').length;
  app.innerHTML = `
    <div class="page-head">
      <div><h2>Medication schedule</h2><p class="muted">${taken} of ${doses.length} doses taken${viewer.id ? ' · filtered to the selected caregiver' : ''}</p></div>
      <label class="inline">Date <input type="date" id="sched-date" value="${scheduleDate}"></label>
    </div>
    <section class="card">${
      doses.length ? doseTable(doses) : empty('No medicines are scheduled for this day. Add medications from an elder’s health record.', '<a class="btn secondary" href="#/elders">Go to elders</a>')
    }</section>`;
  $('#sched-date').onchange = (e) => {
    scheduleDate = e.target.value || todayStr();
    refresh();
  };
}

// ---------- Elders list ----------
let elderSearch = '';
async function renderElders() {
  app.innerHTML = `
    <div class="page-head"><div><h2>Elders</h2><p class="muted">People whose health is being tracked</p></div>${addBtn('elders', 'Add elder')}</div>
    <section class="card">
      <label class="sr-only" for="elder-search">Search elders</label>
      <input id="elder-search" class="search" type="search" placeholder="Search by name…" value="${esc(elderSearch)}">
      <div id="elder-list"></div>
    </section>`;
  let timer;
  $('#elder-search').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      elderSearch = e.target.value.trim();
      loadElderRows();
    }, 250);
  };
  await loadElderRows();
}

async function loadElderRows() {
  const elders = await api.get(`/api/elders${elderSearch ? `?search=${encodeURIComponent(elderSearch)}` : ''}`);
  remember(elders);
  $('#elder-list').innerHTML = elders.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Age</th><th>Conditions</th><th>Emergency contact</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${elders
          .map(
            (e) => `<tr>
              <td><a href="#/elders/${e._id}"><strong>${esc(e.name)}</strong></a>${e.gender ? `<br><small class="muted">${esc(e.gender)}</small>` : ''}</td>
              <td>${e.age ?? '—'}</td>
              <td>${e.conditions?.length ? `<span class="tags">${e.conditions.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</span>` : '<span class="muted">—</span>'}</td>
              <td>${esc(e.emergencyContactName || '—')}${e.emergencyContactPhone ? `<br><a href="tel:${esc(e.emergencyContactPhone)}">${esc(e.emergencyContactPhone)}</a>` : ''}</td>
              <td class="row-actions"><a class="btn small secondary" href="#/elders/${e._id}">Open</a>${editBtn('elders', e._id, e.name)}${delBtn('elders', e._id, e.name)}</td>
            </tr>`
          )
          .join('')}</tbody></table></div>`
    : empty(elderSearch ? 'No elders match your search.' : 'No elders yet.', elderSearch ? '' : addBtn('elders', 'Add elder'));
}

// ---------- Elder health record ----------
const TABS = [
  ['vitals', 'Vital signs'],
  ['medications', 'Medications'],
  ['appointments', 'Appointments'],
  ['history', 'Health history'],
  ['caregivers', 'Caregivers'],
];

async function renderElder(id, tab = 'vitals') {
  if (!TABS.some(([k]) => k === tab)) tab = 'vitals';
  const elder = await api.get(`/api/elders/${id}`);
  remember([elder]);
  const meta = [elder.age != null && `${elder.age} years old`, elder.gender, `Born ${fmtDate(elder.dateOfBirth)}`].filter(Boolean).join(' · ');
  const detail = (label, value) => `<div><dt>${label}</dt><dd>${value || '<span class="muted">—</span>'}</dd></div>`;

  app.innerHTML = `
    <p><a href="#/elders">← All elders</a></p>
    <section class="card">
      <div class="page-head">
        <div><h2>${esc(elder.name)}</h2><p class="muted">${esc(meta)}</p></div>
        <div class="actions">${editBtn('elders', elder._id, elder.name).replace('>Edit<', '>Edit profile<')}${delBtn('elders', elder._id, elder.name)}</div>
      </div>
      <dl class="details">
        ${detail('Health conditions', elder.conditions?.length ? `<span class="tags">${elder.conditions.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</span>` : '')}
        ${detail('Allergies', elder.allergies?.length ? `<span class="tags">${elder.allergies.map((c) => `<span class="tag danger">${esc(c)}</span>`).join('')}</span>` : '')}
        ${detail('Blood type', esc(elder.bloodType))}
        ${detail('Phone', elder.phone ? `<a href="tel:${esc(elder.phone)}">${esc(elder.phone)}</a>` : '')}
        ${detail('Address', esc(elder.address))}
        ${detail('Emergency contact', elder.emergencyContactName ? `${esc(elder.emergencyContactName)}${elder.emergencyContactPhone ? ` – <a href="tel:${esc(elder.emergencyContactPhone)}">${esc(elder.emergencyContactPhone)}</a>` : ''}` : '')}
        ${elder.notes ? detail('Notes', `<span class="pre-line">${esc(elder.notes)}</span>`) : ''}
      </dl>
    </section>
    <nav class="tabs" aria-label="Health record sections">
      ${TABS.map(([k, label]) => `<a href="#/elders/${id}/${k}" class="${k === tab ? 'active' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <section id="tab-panel" class="card"><p class="muted">Loading…</p></section>`;

  await TAB_RENDERERS[tab](elder, $('#tab-panel'));
}

const TAB_RENDERERS = {
  async vitals(elder, panel) {
    const vitals = await api.get(`/api/vitals?elder=${elder._id}&limit=100`);
    remember(vitals);
    const flagged = (v, field) => (v.alerts || []).some((a) => a.field === field);
    const cell = (v, field, value) => `<td class="${field && flagged(v, field) ? 'flag' : ''}">${value ?? '<span class="muted">—</span>'}</td>`;
    const bp = (v) => (v.systolic != null || v.diastolic != null ? `${v.systolic ?? '–'}/${v.diastolic ?? '–'}` : null);
    panel.innerHTML = `
      <div class="panel-head"><h3>Vital signs</h3>${addBtn('vitals', 'Record vital signs', { fixed: { elder: elder._id } })}</div>
      ${vitals.length >= 2 ? trendChart(vitals.slice(0, 20).reverse()) : ''}
      ${
        vitals.length
          ? `<div class="table-wrap"><table>
            <thead><tr><th>Recorded</th><th>Blood pressure</th><th>Heart rate</th><th>Temp °C</th><th>SpO₂ %</th><th>Sugar</th><th>Weight</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>${vitals
              .map(
                (v) => `<tr>
                  <td>${fmtDateTime(v.recordedAt)}${v.notes ? `<p class="desc">${esc(v.notes)}</p>` : ''}</td>
                  ${cell(v, 'bloodPressure', bp(v))}${cell(v, 'heartRate', v.heartRate)}${cell(v, 'temperature', v.temperature)}
                  ${cell(v, 'oxygen', v.oxygen)}${cell(v, 'bloodSugar', v.bloodSugar)}${cell(v, null, v.weight)}
                  <td>${alertBadges(v.alerts || [], true)}</td>
                  <td class="row-actions">${editBtn('vitals', v._id, 'reading')}${delBtn('vitals', v._id, 'reading')}</td>
                </tr>`
              )
              .join('')}</tbody></table></div>`
          : empty('No vital signs recorded yet. Record blood pressure, heart rate, temperature and more.')
      }`;
  },

  async medications(elder, panel) {
    const [meds, doses] = await Promise.all([
      api.get(`/api/medications?elder=${elder._id}`),
      api.get(`/api/medications/schedule?date=${todayStr()}&elder=${elder._id}`),
    ]);
    remember(meds);
    panel.innerHTML = `
      <div class="panel-head"><h3>Medications</h3><div class="actions"><a class="btn secondary" href="#/trash/${elder._id}">🗑 Recently deleted</a>${addBtn('medications', 'Add medication', { fixed: { elder: elder._id } })}</div></div>
      <h4>Today’s doses</h4>
      ${doses.length ? doseTable(doses, { showElder: false }) : '<p class="muted">No doses scheduled today.</p>'}
      <h4>All medications</h4>
      ${
        meds.length
          ? `<div class="table-wrap"><table>
            <thead><tr><th>Medicine</th><th>Kept in</th><th>Times</th><th>Period</th><th>Instructions</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>${meds
              .map(
                (m) => `<tr>
                  <td><strong>${esc(m.name)}</strong><br><small class="muted">${esc(m.dosage)}</small></td>
                  <td>${binWhere(m.bin)}</td>
                  <td>${m.times.map(fmtTime).join(', ')}</td>
                  <td>${fmtDate(m.startDate)} – ${m.endDate ? fmtDate(m.endDate) : 'ongoing'}</td>
                  <td>${esc(m.instructions || '—')}</td>
                  <td>${m.active ? '<span class="badge ok">Active</span>' : '<span class="badge neutral">Stopped</span>'}</td>
                  <td class="row-actions">${editBtn('medications', m._id, m.name)}${delBtn('medications', m._id, m.name)}</td>
                </tr>`
              )
              .join('')}</tbody></table></div>`
          : empty('No medications added yet.')
      }`;
  },

  async appointments(elder, panel) {
    const appts = await api.get(`/api/appointments?elder=${elder._id}`);
    remember(appts);
    const now = Date.now();
    const upcoming = appts.filter((a) => a.status === 'Scheduled' && new Date(a.dateTime) >= now);
    const past = appts.filter((a) => !upcoming.includes(a)).reverse();
    const table = (list) => `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Appointment</th><th>Doctor</th><th>Location</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${list
        .map(
          (a) => `<tr>
            <td>${fmtDateTime(a.dateTime)}</td>
            <td><strong>${esc(a.title)}</strong>${a.notes ? `<p class="desc">${esc(a.notes)}</p>` : ''}</td>
            <td>${esc(a.doctor || '—')}</td>
            <td>${esc(a.location || '—')}</td>
            <td>${statusBadge(a.status)}</td>
            <td class="row-actions">${
              a.status === 'Scheduled'
                ? `<button class="btn small success" data-action="appt-status" data-id="${a._id}" data-status="Completed" aria-label="Mark ${esc(a.title)} completed">✓ Done</button>`
                : ''
            }${editBtn('appointments', a._id, a.title)}${delBtn('appointments', a._id, a.title)}</td>
          </tr>`
        )
        .join('')}</tbody></table></div>`;
    panel.innerHTML = `
      <div class="panel-head"><h3>Appointments</h3>${addBtn('appointments', 'Add appointment', { fixed: { elder: elder._id } })}</div>
      <h4>Upcoming</h4>
      ${upcoming.length ? table(upcoming) : '<p class="muted">No upcoming appointments.</p>'}
      <h4>Past &amp; other</h4>
      ${past.length ? table(past) : '<p class="muted">No past appointments.</p>'}`;
  },

  async history(elder, panel) {
    const records = await api.get(`/api/records?elder=${elder._id}`);
    remember(records);
    panel.innerHTML = `
      <div class="panel-head"><h3>Health history</h3>${addBtn('records', 'Add record', { fixed: { elder: elder._id } })}</div>
      ${
        records.length
          ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Record</th><th>Doctor / facility</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>${records
              .map(
                (r) => `<tr>
                  <td>${fmtDate(r.date)}</td>
                  <td><span class="tag">${esc(r.type)}</span></td>
                  <td><strong>${esc(r.title)}</strong>${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}</td>
                  <td>${esc(r.provider || '—')}</td>
                  <td class="row-actions">${editBtn('records', r._id, r.title)}${delBtn('records', r._id, r.title)}</td>
                </tr>`
              )
              .join('')}</tbody></table></div>`
          : empty('No health history yet. Add diagnoses, procedures, lab results, vaccinations and more.')
      }`;
  },

  async caregivers(elder, panel) {
    const caregivers = await api.get(`/api/caregivers?elders=${elder._id}`);
    remember(caregivers);
    panel.innerHTML = `
      <div class="panel-head"><h3>Caregivers &amp; family</h3>${addBtn('caregivers', 'Add caregiver', { initial: { elders: [elder._id] } })}</div>
      ${
        caregivers.length
          ? `<div class="grid">${caregivers
              .map(
                (c) => `<div class="card">
                  <strong>${esc(c.name)}</strong>${c.relationship ? ` <span class="tag">${esc(c.relationship)}</span>` : ''}
                  <p>${c.phone ? `📞 <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a><br>` : ''}${c.email ? `✉ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</p>
                  <div class="row-actions"><button class="btn small secondary" data-action="monitor" data-id="${c._id}">View as ${esc(c.name.split(' ')[0])}</button>${editBtn('caregivers', c._id, c.name)}</div>
                </div>`
              )
              .join('')}</div>`
          : empty('No caregivers linked yet. Add family members or nurses so they can monitor this person’s health.')
      }`;
  },
};

// ---------- Caregivers ----------
async function renderCaregivers() {
  const caregivers = await api.get('/api/caregivers');
  remember(caregivers);
  app.innerHTML = `
    <div class="page-head"><div><h2>Caregivers &amp; family</h2><p class="muted">People who help monitor elders’ health. Use “Monitor” to see the dashboard for just the elders they look after.</p></div>${addBtn('caregivers', 'Add caregiver')}</div>
    <section class="card">${
      caregivers.length
        ? `<div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Looks after</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${caregivers
            .map(
              (c) => `<tr>
                <td><strong>${esc(c.name)}</strong>${c.relationship ? `<br><small class="muted">${esc(c.relationship)}</small>` : ''}</td>
                <td>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a><br>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${!c.phone && !c.email ? '—' : ''}</td>
                <td>${c.elders.length ? c.elders.map((e) => `<a href="#/elders/${e._id}">${esc(e.name)}</a>`).join(', ') : '<span class="muted">No one yet</span>'}</td>
                <td class="row-actions"><button class="btn small secondary" data-action="monitor" data-id="${c._id}">Monitor</button>${editBtn('caregivers', c._id, c.name)}${delBtn('caregivers', c._id, c.name)}</td>
              </tr>`
            )
            .join('')}</tbody></table></div>`
        : empty('No caregivers yet.', addBtn('caregivers', 'Add caregiver'))
    }</section>`;
}

// ---------- Storage bins ----------
async function renderBins() {
  const [bins, meds] = await Promise.all([api.get('/api/bins'), api.get('/api/medications')]);
  remember(bins);
  remember(meds);
  const byBin = new Map();
  const unassigned = [];
  for (const m of meds) {
    if (m.bin) byBin.set(m.bin._id, [...(byBin.get(m.bin._id) || []), m]);
    else unassigned.push(m);
  }
  const medItem = (m) => `<li><strong>${esc(m.name)}</strong> <small class="muted">${esc(m.dosage)}${m.elder ? ` · ${esc(m.elder.name)}` : ''}</small></li>`;

  app.innerHTML = `
    <div class="page-head">
      <div><h2>📦 Storage bins</h2><p class="muted">Label each bin and assign medicines to it, so anyone can find a medicine quickly.</p></div>
      ${addBtn('bins', 'Add storage bin')}
    </div>
    <section class="card">
      <label for="med-find"><strong>🔍 Find a medicine</strong></label>
      <input id="med-find" class="search" type="search" placeholder="Type a medicine name…" autocomplete="off">
      <div id="find-results" aria-live="polite"></div>
    </section>
    ${
      bins.length
        ? `<section class="grid bins-grid" aria-label="Storage bins">${bins
            .map((b) => {
              const inside = byBin.get(b._id) || [];
              return `<article class="card bin-card">
                <header>
                  <a class="bin-label c-${esc(b.color)}" href="#/bins/${b._id}" aria-label="Bin ${esc(b.label)}">${esc(b.label)}</a>
                  <div><strong>📍 ${esc(b.location)}</strong>${b.description ? `<br><small class="muted">${esc(b.description)}</small>` : ''}${
                    b.elder ? `<br><small>For <a href="#/elders/${b.elder._id}">${esc(b.elder.name)}</a></small>` : ''
                  }</div>
                </header>
                <p class="muted">${inside.length} medicine${inside.length === 1 ? '' : 's'}</p>
                ${inside.length ? `<ul class="med-list">${inside.map(medItem).join('')}</ul>` : ''}
                <div class="row-actions">
                  <a class="btn small secondary" href="#/bins/${b._id}">🏷 View &amp; print label</a>
                  ${editBtn('bins', b._id, `bin ${b.label}`)}${delBtn('bins', b._id, `bin ${b.label}`)}
                </div>
              </article>`;
            })
            .join('')}</section>`
        : `<div class="card">${empty('No storage bins yet. Add one for each box, drawer or shelf where medicines are kept.', addBtn('bins', 'Add storage bin'))}</div>`
    }
    ${
      unassigned.length
        ? `<section class="card"><h3>Medicines without a bin (${unassigned.length})</h3><p class="muted">Edit a medicine to choose the bin it is kept in.</p>
          <div class="table-wrap"><table><tbody>${unassigned
            .map((m) => `<tr><td><strong>${esc(m.name)}</strong> <small class="muted">${esc(m.dosage)}</small></td><td>${m.elder ? esc(m.elder.name) : '—'}</td><td class="row-actions">${editBtn('medications', m._id, m.name).replace('>Edit<', '>Assign bin<')}</td></tr>`)
            .join('')}</tbody></table></div></section>`
        : ''
    }`;

  // Find a medicine → shows where it is kept
  $('#med-find').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    const results = q ? meds.filter((m) => m.name.toLowerCase().includes(q)) : [];
    $('#find-results').innerHTML = !q
      ? ''
      : results.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Medicine</th><th>For</th><th>Where to find it</th></tr></thead>
            <tbody>${results
              .map((m) => `<tr><td><strong>${esc(m.name)}</strong><br><small class="muted">${esc(m.dosage)}</small></td><td>${m.elder ? esc(m.elder.name) : '—'}</td><td>${binWhere(m.bin)}</td></tr>`)
              .join('')}</tbody></table></div>`
        : `<p class="muted">No medicine named “${esc(e.target.value.trim())}”.</p>`;
  };
}

async function renderBinDetail(id) {
  const [bin, meds] = await Promise.all([api.get(`/api/bins/${id}`), api.get(`/api/medications?bin=${id}`)]);
  remember([bin]);
  remember(meds);
  const color = esc(bin.color);
  app.innerHTML = `
    <p class="no-print"><a href="#/bins">← All storage bins</a></p>
    <div class="page-head no-print">
      <div><h2>Bin ${esc(bin.label)}</h2><p class="muted">📍 ${esc(bin.location)}</p></div>
      <div class="actions">
        <button class="btn primary" data-action="print">🖨 Print label</button>
        ${editBtn('bins', bin._id, `bin ${bin.label}`)}
      </div>
    </div>
    <section class="print-area" aria-label="Label preview">
      <div class="bin-print bc-${color}">
        <div class="bin-print-head c-${color}"><img src="icon.svg" alt="" width="32" height="32"><span>GoldenCare · Medicine storage</span></div>
        <div class="bin-print-code">${esc(bin.label)}</div>
        <div class="bin-print-loc">📍 ${esc(bin.location)}</div>
        ${bin.elder ? `<div class="bin-print-owner">For: ${esc(bin.elder.name)}</div>` : ''}
        ${bin.description ? `<div class="bin-print-owner">${esc(bin.description)}</div>` : ''}
        ${
          meds.length
            ? `<ul class="bin-print-meds">${meds
                .map((m) => `<li>${esc(m.name)} – ${esc(m.dosage)}${m.elder && !bin.elder ? ` (${esc(m.elder.name)})` : ''}</li>`)
                .join('')}</ul>`
            : ''
        }
      </div>
    </section>
    <section class="card no-print">
      <div class="panel-head"><h3>Medicines in this bin (${meds.length})</h3></div>
      ${
        meds.length
          ? `<div class="table-wrap"><table>
            <thead><tr><th>Medicine</th><th>For</th><th>Times</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>${meds
              .map(
                (m) => `<tr>
                  <td><strong>${esc(m.name)}</strong><br><small class="muted">${esc(m.dosage)}</small></td>
                  <td>${m.elder ? `<a href="#/elders/${m.elder._id}/medications">${esc(m.elder.name)}</a>` : '—'}</td>
                  <td>${m.times.map(fmtTime).join(', ')}</td>
                  <td class="row-actions">${editBtn('medications', m._id, m.name).replace('>Edit<', '>Move / edit<')}</td>
                </tr>`
              )
              .join('')}</tbody></table></div>`
          : empty('No medicines in this bin yet. Edit a medicine and choose this bin.')
      }
    </section>`;
}

// ---------- Recently deleted medicines ----------
async function renderTrash(elderId) {
  const elder = elderId ? await api.get(`/api/elders/${elderId}`) : null;
  const items = await api.get(`/api/medications/trash${elderId ? `?elder=${elderId}` : ''}`);
  const scope = elderId ? ` data-elder="${elderId}"` : '';
  app.innerHTML = `
    ${elder ? `<p><a href="#/elders/${elder._id}/medications">← ${esc(elder.name)}’s medications</a></p>` : ''}
    <div class="page-head">
      <div>
        <h2>🗑 Recently deleted medicines${elder ? ` – ${esc(elder.name)}` : ''}</h2>
        <p class="muted">Deleted medicines stay here for 30 days before they are removed for good. Restore one to put it back in the schedule.</p>
      </div>
      <div class="actions">
        ${elder ? '<a class="btn secondary" href="#/trash">Show all elders</a>' : ''}
        ${items.length ? `<button class="btn danger" data-action="empty-trash" data-count="${items.length}"${scope}>Empty trash</button>` : ''}
      </div>
    </div>
    <section class="card">${
      items.length
        ? `<div class="table-wrap"><table>
          <thead><tr><th>Medicine</th>${elder ? '' : '<th>Elder</th>'}<th>Times</th><th>Deleted</th><th>Removed forever on</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${items
            .map(
              (m) => `<tr>
                <td><strong>${esc(m.name)}</strong><br><small class="muted">${esc(m.dosage)}</small></td>
                ${elder ? '' : `<td>${m.elder ? `<a href="#/elders/${m.elder._id}/medications">${esc(m.elder.name)}</a>` : '<span class="muted">—</span>'}</td>`}
                <td>${m.times.map(fmtTime).join(', ')}</td>
                <td>${fmtDateTime(m.deletedAt)}</td>
                <td>${new Date(m.purgeAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</td>
                <td class="row-actions">
                  <button class="btn small success" data-action="restore" data-res="medications" data-id="${m._id}" aria-label="Restore ${esc(m.name)}">↺ Restore</button>
                  <button class="btn small danger" data-action="purge" data-res="medications" data-id="${m._id}" data-name="${esc(m.name)}" aria-label="Delete ${esc(m.name)} forever">Delete forever</button>
                </td>
              </tr>`
            )
            .join('')}</tbody></table></div>`
        : empty('Nothing has been deleted recently.')
    }</section>`;
}

async function restoreItem(res, id) {
  await api.post(`${RESOURCES[res].endpoint}/${id}/restore`);
  hideToast();
  toast(`${RESOURCES[res].singular} restored`);
  refresh();
  checkReminders();
}

async function purgeItem(res, id, name) {
  if (!confirm(`Permanently delete “${name}”?\n\nIts dose history will also be deleted. This cannot be undone.`)) return;
  await api.del(`${RESOURCES[res].endpoint}/${id}/permanent`);
  toast(`${RESOURCES[res].singular} permanently deleted`);
  refresh();
}

async function emptyTrash(elderId, count) {
  if (!confirm(`Permanently delete ${count} medicine${count === '1' ? '' : 's'} in Recently deleted?\n\nThis cannot be undone.`)) return;
  const r = await api.del(`/api/medications/trash${elderId ? `?elder=${elderId}` : ''}`);
  toast(`Trash emptied (${r.deleted} deleted)`);
  refresh();
}

// =====================================================================
// Medication reminders
// =====================================================================
const REMINDER_WINDOW_MIN = 120; // pop up reminders for doses due in the last 2 hours
const notified = new Set((() => { try { return JSON.parse(sessionStorage.getItem('gc-notified') || '[]'); } catch { return []; } })());
const saveNotified = () => { try { sessionStorage.setItem('gc-notified', JSON.stringify([...notified])); } catch { /* ignore */ } };
const doseKey = (d) => `${d.medicationId}|${d.date}|${d.time}`;

async function checkReminders() {
  try {
    const date = todayStr();
    const now = nowHM();
    const doses = await api.get(`/api/medications/schedule?date=${date}${viewerQuery()}`);
    const due = doses.filter((d) => d.status === 'Pending' && d.time <= now);
    const dueKeys = new Set(due.map(doseKey));

    const badge = $('#due-badge');
    badge.hidden = !due.length;
    badge.textContent = due.length;
    badge.setAttribute('aria-label', `${due.length} doses due`);

    // Remove reminders that were handled elsewhere
    document.querySelectorAll('.reminder').forEach((el) => { if (!dueKeys.has(el.dataset.key)) el.remove(); });

    for (const d of due) {
      const key = doseKey(d);
      if (notified.has(key) || toMinutes(now) - toMinutes(d.time) > REMINDER_WINDOW_MIN) continue;
      notified.add(key);
      showReminder(d, key);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('GoldenCare – time for medicine', {
          body: `${d.elder?.name ? `${d.elder.name}: ` : ''}${d.name} ${d.dosage} (${fmtTime(d.time)})`,
          tag: key,
        });
      }
    }
    saveNotified();
  } catch {
    /* server unreachable – try again next minute */
  }
}

function showReminder(d, key) {
  const el = document.createElement('div');
  el.className = 'reminder';
  el.dataset.key = key;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <strong>💊 Time for medicine</strong>
    <p>${d.elder ? `${esc(d.elder.name)}: ` : ''}<b>${esc(d.name)}</b> – ${esc(d.dosage)}<br>
    <small class="muted">Due ${fmtTime(d.time)}${d.instructions ? ` · ${esc(d.instructions)}` : ''}</small>
    ${d.bin ? `<br><small>📍 Find it in <b>${esc(d.bin.label)}</b> · ${esc(d.bin.location)}</small>` : ''}</p>
    <div class="row-actions">${doseBtn(d, 'Taken', '✓ Taken', 'success')}${doseBtn(d, 'Skipped', 'Skip', 'secondary')}<button class="btn small secondary" data-action="dismiss">Later</button></div>`;
  $('#reminders').append(el);
}

async function markDose(med, date, time, status) {
  await api.post(`/api/medications/${med}/doses`, { date, time, status });
  toast(status === 'Pending' ? 'Dose reset' : `Dose marked as ${status.toLowerCase()}`);
  document.querySelectorAll('.reminder').forEach((el) => { if (el.dataset.key === `${med}|${date}|${time}`) el.remove(); });
  refresh();
  checkReminders();
}

function updateNotifyButton() {
  const btn = $('#notify-btn');
  btn.hidden = !('Notification' in window) || Notification.permission !== 'default';
}

// =====================================================================
// Accessibility preferences
// =====================================================================
const FONT_SIZES = [16, 18, 20, 22, 24];
function applyPrefs() {
  const idx = store.get('gc-font', 1);
  document.documentElement.style.fontSize = `${FONT_SIZES[idx] ?? 18}px`;
  const contrast = store.get('gc-contrast', false);
  document.body.classList.toggle('high-contrast', contrast);
  $('[data-action="contrast"]').setAttribute('aria-pressed', String(contrast));
}

// =====================================================================
// Global click handling
// =====================================================================
const parseData = (s) => { try { return s ? JSON.parse(s) : undefined; } catch { return undefined; } };

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, res, id } = btn.dataset;
  try {
    switch (action) {
      case 'add':
        await openForm(res, { fixed: parseData(btn.dataset.fixed), initial: parseData(btn.dataset.initial) });
        break;
      case 'edit':
        await openForm(res, { item: cache.get(id) || (await api.get(`${RESOURCES[res].endpoint}/${id}`)) });
        break;
      case 'delete':
        await removeItem(res, id);
        break;
      case 'dose':
        btn.disabled = true;
        await markDose(btn.dataset.med, btn.dataset.date, btn.dataset.time, btn.dataset.status);
        break;
      case 'print':
        window.print();
        break;
      case 'restore':
        btn.disabled = true;
        await restoreItem(res, id);
        break;
      case 'purge':
        await purgeItem(res, id, btn.dataset.name);
        break;
      case 'empty-trash':
        await emptyTrash(btn.dataset.elder, btn.dataset.count);
        break;
      case 'appt-status':
        await api.put(`/api/appointments/${id}`, { status: btn.dataset.status });
        toast(`Appointment marked ${btn.dataset.status.toLowerCase()}`);
        refresh();
        break;
      case 'monitor':
        viewer.set(id);
        checkReminders();
        if (location.hash === '#/dashboard') refresh();
        else location.hash = '#/dashboard';
        break;
      case 'dismiss':
        btn.closest('.reminder')?.remove();
        break;
      case 'font': {
        const idx = Math.min(FONT_SIZES.length - 1, Math.max(0, store.get('gc-font', 1) + Number(btn.dataset.step)));
        store.set('gc-font', idx);
        applyPrefs();
        break;
      }
      case 'contrast':
        store.set('gc-contrast', !store.get('gc-contrast', false));
        applyPrefs();
        break;
      case 'notify':
        await Notification.requestPermission();
        updateNotifyButton();
        if (Notification.permission === 'granted') toast('Reminders will also appear as notifications');
        break;
    }
  } catch (err) {
    btn.disabled = false;
    toast(err.message, 'error');
  }
});

// =====================================================================
// Router
// =====================================================================
const ROUTES = [
  [/^#\/dashboard$/, renderDashboard],
  [/^#\/today$/, renderToday],
  [/^#\/elders$/, renderElders],
  [/^#\/elders\/([a-f0-9]{24})(?:\/(\w+))?$/, renderElder],
  [/^#\/caregivers$/, renderCaregivers],
  [/^#\/trash(?:\/([a-f0-9]{24}))?$/, renderTrash],
  [/^#\/bins$/, renderBins],
  [/^#\/bins\/([a-f0-9]{24})$/, renderBinDetail],
];

let lastPage = '';
async function route() {
  const hash = location.hash || '#/dashboard';
  const match = ROUTES.map(([rx, fn]) => [hash.match(rx), fn]).find(([m]) => m);
  if (!match) {
    location.hash = '#/dashboard';
    return;
  }
  document.querySelectorAll('.main-nav a').forEach((a) => {
    const active = hash.startsWith(a.getAttribute('href'));
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const [m, fn] = match;
  const page = hash.split('/').slice(0, 3).join('/');
  try {
    await fn(...m.slice(1));
    if (page !== lastPage) {
      // Move focus to the new page for keyboard / screen-reader users
      app.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      lastPage = page;
    }
  } catch (err) {
    app.innerHTML = `<div class="card empty"><h2>Something went wrong</h2><p>${esc(err.message)}</p><a class="btn secondary" href="#/dashboard">Back to dashboard</a></div>`;
  }
}
const refresh = route;

// ---------- Start ----------
applyPrefs();
updateNotifyButton();
window.addEventListener('hashchange', route);
route();
checkReminders();
setInterval(checkReminders, 60 * 1000);
