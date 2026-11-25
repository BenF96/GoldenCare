// End-to-end API tests for GoldenCare.
// Runs the real Express app against a throwaway in-memory MongoDB – never touches your database.
//   npm test
// The first run downloads a MongoDB binary (~600 MB, cached afterwards). To reuse an existing
// mongod instead, set MONGOMS_SYSTEM_BINARY=/path/to/mongod.
process.env.NODE_ENV = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { start } = require('../server');
const Medication = require('../models/Medication');
const DoseLog = require('../models/DoseLog');

let mem, server, origin, base;
const today = new Date().toLocaleDateString('en-CA');
const MISSING_ID = '507f1f77bcf86cd799439011';

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json(), headers: res.headers };
}

before(async () => {
  mem = await MongoMemoryServer.create();
  server = await start({ mongoUri: mem.getUri(), port: 0 }); // port 0 = any free port
  origin = `http://localhost:${server.address().port}`;
  base = `${origin}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mem.stop();
});

describe('Elders', () => {
  let elderId;

  it('creates an elder and computes age', async () => {
    const r = await call('POST', '/elders', { name: 'Maria Santos', dateOfBirth: '1945-03-12', conditions: ['Hypertension'] });
    assert.equal(r.status, 201);
    assert.ok(r.data.age >= 80);
    elderId = r.data._id;
  });

  it('rejects missing required fields', async () => {
    const r = await call('POST', '/elders', { name: '' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /Name is required/);
    assert.match(r.data.error, /Date of birth is required/);
  });

  it('rejects a date of birth in the future', async () => {
    const r = await call('POST', '/elders', { name: 'X', dateOfBirth: '2999-01-01' });
    assert.equal(r.status, 400);
  });

  it('updates an elder', async () => {
    const r = await call('PUT', `/elders/${elderId}`, { phone: '0917 555' });
    assert.equal(r.status, 200);
    assert.equal(r.data.phone, '0917 555');
  });

  it('searches elders by name', async () => {
    const r = await call('GET', '/elders?search=mar');
    assert.equal(r.data.length, 1);
  });

  it('returns 400 for an invalid id and 404 for a missing one', async () => {
    assert.equal((await call('GET', '/elders/abc')).status, 400);
    assert.equal((await call('GET', `/elders/${MISSING_ID}`)).status, 404);
  });
});

describe('Vitals, medications, appointments, records, caregivers, dashboard', () => {
  let elderId, vitalId, medId, cgId, emptyCgId;

  before(async () => {
    elderId = (await call('POST', '/elders', { name: 'Rosa Cruz', dateOfBirth: '1944-05-01' })).data._id;
  });

  it('records vitals and flags abnormal readings', async () => {
    const r = await call('POST', '/vitals', { elder: elderId, systolic: 165, diastolic: 95, heartRate: 72, temperature: 38.4 });
    assert.equal(r.status, 201);
    assert.deepEqual(r.data.alerts.map((a) => a.message).sort(), ['Fever', 'High blood pressure']);
    vitalId = r.data._id;
  });

  it('requires at least one measurement', async () => {
    const r = await call('POST', '/vitals', { elder: elderId });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /at least one measurement/);
  });

  it('rejects out-of-range values on update', async () => {
    const r = await call('PUT', `/vitals/${vitalId}`, { systolic: 300 });
    assert.equal(r.status, 400);
  });

  it('lists vitals by elder', async () => {
    assert.equal((await call('GET', `/vitals?elder=${elderId}`)).data.length, 1);
  });

  it('creates a medication and validates times and dates', async () => {
    let r = await call('POST', '/medications', { elder: elderId, name: 'Metformin', dosage: '500 mg', times: ['08:00', '20:00'], startDate: today });
    assert.equal(r.status, 201);
    medId = r.data._id;
    r = await call('POST', '/medications', { elder: elderId, name: 'Bad', dosage: '1', times: ['25:00'], startDate: today });
    assert.equal(r.status, 400);
    r = await call('POST', '/medications', { elder: elderId, name: 'Bad', dosage: '1', times: ['08:00'], startDate: today, endDate: '2000-01-01' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /before the start date/);
  });

  it('builds the daily schedule and tracks taken / skipped / undo', async () => {
    let r = await call('GET', `/medications/schedule?date=${today}&elder=${elderId}`);
    assert.equal(r.data.length, 2);
    assert.ok(r.data.every((d) => d.status === 'Pending'));

    r = await call('POST', `/medications/${medId}/doses`, { date: today, time: '08:00', status: 'Taken' });
    assert.equal(r.data.status, 'Taken');
    r = await call('POST', `/medications/${medId}/doses`, { date: today, time: '08:00', status: 'Skipped' });
    assert.equal(r.data.status, 'Skipped');
    r = await call('POST', `/medications/${medId}/doses`, { date: today, time: '09:00', status: 'Taken' });
    assert.equal(r.status, 400, 'unscheduled time is rejected');

    r = await call('GET', `/medications/schedule?date=${today}&elder=${elderId}`);
    assert.deepEqual(r.data.map((d) => d.status), ['Skipped', 'Pending']);

    await call('POST', `/medications/${medId}/doses`, { date: today, time: '08:00', status: 'Pending' });
    r = await call('GET', `/medications/schedule?date=${today}&elder=${elderId}`);
    assert.equal(r.data[0].status, 'Pending');

    r = await call('GET', `/medications/schedule?date=1999-01-01&elder=${elderId}`);
    assert.equal(r.data.length, 0, 'nothing before the start date');
  });

  it('creates appointments and health records', async () => {
    const future = new Date(Date.now() + 2 * 864e5).toISOString();
    let r = await call('POST', '/appointments', { elder: elderId, title: 'Cardiology', dateTime: future });
    assert.equal(r.status, 201);
    assert.equal(r.data.status, 'Scheduled');
    r = await call('PUT', `/appointments/${r.data._id}`, { status: 'Bogus' });
    assert.equal(r.status, 400);
    r = await call('POST', '/records', { elder: elderId, date: today, type: 'Vaccination', title: 'Flu shot' });
    assert.equal(r.status, 201);
  });

  it('creates caregivers linked to elders', async () => {
    let r = await call('POST', '/caregivers', { name: 'Ana', relationship: 'Daughter', email: 'ana@example.com', elders: [elderId] });
    assert.equal(r.status, 201);
    assert.equal(r.data.elders[0].name, 'Rosa Cruz');
    cgId = r.data._id;
    r = await call('POST', '/caregivers', { name: 'Bad', email: 'nope' });
    assert.equal(r.status, 400);
    emptyCgId = (await call('POST', '/caregivers', { name: 'Nobody' })).data._id;
    r = await call('GET', `/caregivers?elders=${elderId}`);
    assert.equal(r.data.length, 1);
  });

  it('shows the dashboard overview, optionally for one caregiver', async () => {
    let r = await call('GET', `/dashboard?date=${today}`);
    const row = r.data.find((x) => x.elder._id === elderId);
    assert.equal(row.latestVital.alerts.length, 2);
    assert.equal(row.doses.length, 2);
    assert.equal(row.nextAppointment.title, 'Cardiology');

    r = await call('GET', `/dashboard?date=${today}&caregiver=${emptyCgId}`);
    assert.equal(r.data.length, 0);
    r = await call('GET', `/dashboard?date=${today}&caregiver=${cgId}`);
    assert.equal(r.data.length, 1);
    r = await call('GET', `/medications/schedule?date=${today}&caregiver=${cgId}`);
    assert.equal(r.data.length, 2);
  });

  it('deleting an elder removes their data and unlinks caregivers', async () => {
    assert.equal((await call('DELETE', `/elders/${elderId}`)).status, 200);
    for (const res of ['vitals', 'medications', 'appointments', 'records']) {
      const r = await call('GET', `/${res}?elder=${elderId}`);
      assert.equal(r.data.length, 0, `${res} removed`);
    }
    assert.equal((await call('GET', `/caregivers/${cgId}`)).data.elders.length, 0);
    assert.equal((await call('DELETE', `/caregivers/${cgId}`)).status, 200);
  });
});

describe('Production hardening', () => {
  it('serves the frontend with security headers', async () => {
    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /GoldenCare/);
    const csp = page.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/, 'no HTTPS upgrade on plain HTTP');
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('x-powered-by'), null);
  });

  it('has a health check', async () => {
    const r = await fetch(`${origin}/healthz`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, 'ok');
  });

  it('rejects malformed and oversized JSON', async () => {
    const opts = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const bad = await fetch(`${base}/elders`, opts('{oops'));
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'Invalid JSON');
    const big = await fetch(`${base}/elders`, opts(JSON.stringify({ notes: 'x'.repeat(200000) })));
    assert.equal(big.status, 413);
  });

  it('returns JSON 404 for unknown API routes and sends rate-limit headers', async () => {
    const r = await call('GET', '/nope');
    assert.equal(r.status, 404);
    assert.equal(r.data.error, 'Not found');
    assert.ok(r.headers.get('ratelimit-policy') || r.headers.get('ratelimit'));
  });

  it('runs full validation on updates, not just on create', async () => {
    const elder = (await call('POST', '/elders', { name: 'Upd', dateOfBirth: '1950-01-01' })).data._id;
    const med = (await call('POST', '/medications', { elder, name: 'A', dosage: '1', times: ['08:00'], startDate: '2026-01-10' })).data._id;
    let r = await call('PUT', `/medications/${med}`, { endDate: '2026-01-01' });
    assert.equal(r.status, 400);
    const vital = (await call('POST', '/vitals', { elder, heartRate: 70 })).data._id;
    r = await call('PUT', `/vitals/${vital}`, { heartRate: null });
    assert.equal(r.status, 400, 'cannot clear every measurement');
    r = await call('PUT', `/medications/${med}`, { times: ['09:00', '21:00'] });
    assert.equal(r.status, 200);
    assert.equal((await call('PUT', `/caregivers/${MISSING_ID}`, { name: 'x' })).status, 404);
  });
});

describe('Recently deleted medicines (trash)', () => {
  let elder, med;
  const mk = async (name) =>
    (await call('POST', '/medications', { elder, name, dosage: '1', times: ['10:00'], startDate: today })).data._id;

  before(async () => {
    elder = (await call('POST', '/elders', { name: 'Trash Test', dateOfBirth: '1950-01-01' })).data._id;
    med = (await call('POST', '/medications', { elder, name: 'Aspirin', dosage: '81 mg', times: ['07:00'], startDate: today })).data._id;
    await call('POST', `/medications/${med}/doses`, { date: today, time: '07:00', status: 'Taken' });
  });

  it('delete moves a medicine to the trash and hides it everywhere', async () => {
    const r = await call('DELETE', `/medications/${med}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.trashed, true);
    assert.ok(!(await call('GET', `/medications?elder=${elder}`)).data.some((m) => m._id === med));
    assert.equal((await call('GET', `/medications/${med}`)).status, 404);
    assert.equal((await call('PUT', `/medications/${med}`, { dosage: '2' })).status, 404);
    assert.ok(!(await call('GET', `/medications/schedule?date=${today}&elder=${elder}`)).data.some((d) => d.name === 'Aspirin'));
    assert.equal((await call('POST', `/medications/${med}/doses`, { date: today, time: '07:00', status: 'Taken' })).status, 404);
    assert.equal((await call('DELETE', `/medications/${med}`)).status, 404, 'cannot delete twice');
  });

  it('lists trashed medicines with elder name and purge date', async () => {
    const item = (await call('GET', '/medications/trash')).data.find((m) => m._id === med);
    assert.equal(item.elder.name, 'Trash Test');
    assert.ok(item.purgeAt);
  });

  it('restores a medicine with its dose history', async () => {
    let r = await call('POST', `/medications/${med}/restore`);
    assert.equal(r.status, 200);
    assert.equal(r.data.deletedAt, null);
    r = await call('GET', `/medications/schedule?date=${today}&elder=${elder}`);
    assert.equal(r.data.find((d) => d.name === 'Aspirin').status, 'Taken');
    assert.equal((await call('POST', `/medications/${med}/restore`)).status, 404, 'not in trash any more');
  });

  it('permanently deletes only from the trash, with dose history', async () => {
    assert.equal((await call('DELETE', `/medications/${med}/permanent`)).status, 404, 'must be in trash first');
    await call('DELETE', `/medications/${med}`);
    assert.equal((await call('DELETE', `/medications/${med}/permanent`)).status, 200);
    assert.ok(!(await call('GET', '/medications/trash')).data.some((m) => m._id === med));
    assert.equal(await DoseLog.countDocuments({ medication: med }), 0);
  });

  it('empties the trash for one elder', async () => {
    const [a, b] = [await mk('B1'), await mk('B2')];
    await call('DELETE', `/medications/${a}`);
    await call('DELETE', `/medications/${b}`);
    const r = await call('DELETE', `/medications/trash?elder=${elder}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.deleted, 2);
  });

  it('purges items older than 30 days and keeps recent ones', async () => {
    const old = await mk('Old');
    await call('DELETE', `/medications/${old}`);
    await Medication.updateOne({ _id: old }, { deletedAt: new Date(Date.now() - 31 * 864e5) });
    const fresh = await mk('Fresh');
    await call('DELETE', `/medications/${fresh}`);
    const r = await call('GET', '/medications/trash');
    assert.ok(!r.data.some((m) => m._id === old));
    assert.equal(await Medication.exists({ _id: old }), null);
    assert.ok(r.data.some((m) => m._id === fresh));
  });
});

describe('Audit fixes', () => {
  let elder;
  const day = (offset) => new Date(Date.now() + offset * 864e5).toLocaleDateString('en-CA');

  before(async () => {
    elder = (await call('POST', '/elders', { name: 'Audit Test', dateOfBirth: '1950-01-01' })).data._id;
  });

  it('1. removes duplicate dose times and normalises them', async () => {
    let r = await call('POST', '/medications', { elder, name: 'Dup', dosage: '1', times: ['20:00', '8:00', '08:00', ' 08:00 '], startDate: today });
    assert.equal(r.status, 201);
    assert.deepEqual(r.data.times, ['08:00', '20:00']);
    const med = r.data._id;
    r = await call('PUT', `/medications/${med}`, { times: ['09:00', '09:00'] });
    assert.deepEqual(r.data.times, ['09:00']);
    r = await call('GET', `/medications/schedule?date=${today}&elder=${elder}`);
    assert.equal(r.data.filter((d) => d.name === 'Dup').length, 1, 'dose appears once in the schedule');
  });

  it('2. only allows marking doses on scheduled, non-future days', async () => {
    const med = (await call('POST', '/medications', { elder, name: 'Range', dosage: '1', times: ['08:00'], startDate: day(-5), endDate: day(-1) })).data._id;
    let r = await call('POST', `/medications/${med}/doses`, { date: day(-3), time: '08:00', status: 'Taken' });
    assert.equal(r.status, 200, 'a day inside the range works');
    r = await call('POST', `/medications/${med}/doses`, { date: day(-6), time: '08:00', status: 'Taken' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /not scheduled on that date/);
    r = await call('POST', `/medications/${med}/doses`, { date: today, time: '08:00', status: 'Taken' });
    assert.equal(r.status, 400, 'after the end date');

    const ongoing = (await call('POST', '/medications', { elder, name: 'Ongoing', dosage: '1', times: ['08:00'], startDate: today })).data._id;
    r = await call('POST', `/medications/${ongoing}/doses`, { date: day(5), time: '08:00', status: 'Taken' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /future date/);
    r = await call('POST', `/medications/${ongoing}/doses`, { date: today, time: '08:00', status: 'Taken' });
    assert.equal(r.status, 200);
  });

  it('3. rejects vital-sign readings dated in the future', async () => {
    const future = new Date(Date.now() + 2 * 864e5).toISOString();
    let r = await call('POST', '/vitals', { elder, heartRate: 70, recordedAt: future });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /cannot be in the future/);
    r = await call('POST', '/vitals', { elder, heartRate: 70 });
    assert.equal(r.status, 201, 'now is fine');
    r = await call('PUT', `/vitals/${r.data._id}`, { recordedAt: future });
    assert.equal(r.status, 400, 'also on update');
  });

  it('4. purges expired trash on a schedule, without anyone opening the trash', async () => {
    const { runPurgers } = require('../utils/crud');
    const med = (await call('POST', '/medications', { elder, name: 'Expired', dosage: '1', times: ['08:00'], startDate: today })).data._id;
    await call('DELETE', `/medications/${med}`);
    await Medication.updateOne({ _id: med }, { deletedAt: new Date(Date.now() - 31 * 864e5) });
    await runPurgers();
    assert.equal(await Medication.exists({ _id: med }), null);
  });
});

describe('Storage bins (where medicines are kept)', () => {
  let elder, binA, binF, insulin;

  before(async () => {
    elder = (await call('POST', '/elders', { name: 'Bin Test', dateOfBirth: '1950-01-01' })).data._id;
  });

  it('creates a bin with a normalised label and populated owner', async () => {
    const r = await call('POST', '/bins', { label: ' a-01 ', location: 'Nurse station – Cabinet 2, Shelf 3', color: 'Red', elder });
    assert.equal(r.status, 201);
    assert.equal(r.data.label, 'A-01');
    assert.equal(r.data.elder.name, 'Bin Test');
    binA = r.data._id;
    binF = (await call('POST', '/bins', { label: 'F-01', location: 'Kitchen fridge', color: 'Blue' })).data._id;
  });

  it('validates bins (unique label, location required, valid colour)', async () => {
    let r = await call('POST', '/bins', { label: 'A-01', location: 'Elsewhere' });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /already exists/);
    r = await call('POST', '/bins', { label: 'B-01' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /Location is required/);
    assert.equal((await call('POST', '/bins', { label: 'C-01', location: 'Fridge', color: 'Pink' })).status, 400);
  });

  it('assigns a medicine to a bin and rejects unknown bins', async () => {
    let r = await call('POST', '/medications', { elder, name: 'Insulin', dosage: '10 units', times: ['08:00'], startDate: today, bin: binA });
    assert.equal(r.status, 201);
    assert.equal(r.data.bin.label, 'A-01');
    assert.match(r.data.bin.location, /Cabinet 2/);
    insulin = r.data._id;
    r = await call('POST', '/medications', { elder, name: 'X', dosage: '1', times: ['08:00'], startDate: today, bin: MISSING_ID });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /Storage bin not found/);
  });

  it('shows where to find a medicine in the schedule, bin list and search', async () => {
    let r = await call('GET', `/medications/schedule?date=${today}&elder=${elder}`);
    assert.equal(r.data.find((d) => d.name === 'Insulin').bin.label, 'A-01');
    r = await call('GET', `/medications?bin=${binA}`);
    assert.deepEqual(r.data.map((m) => m.name), ['Insulin']);
    r = await call('GET', '/medications?search=insu');
    assert.equal(r.data[0].bin.label, 'A-01');
  });

  it('moves, unassigns and reassigns a medicine', async () => {
    let r = await call('PUT', `/medications/${insulin}`, { bin: binF });
    assert.equal(r.data.bin.label, 'F-01');
    r = await call('PUT', `/medications/${insulin}`, { bin: null });
    assert.equal(r.data.bin, null);
    await call('PUT', `/medications/${insulin}`, { bin: binF });
  });

  it('updates and searches bins', async () => {
    let r = await call('PUT', `/bins/${binF}`, { location: 'Kitchen fridge, top shelf' });
    assert.equal(r.data.location, 'Kitchen fridge, top shelf');
    r = await call('GET', '/bins?search=fridge');
    assert.equal(r.data.length, 1);
  });

  it('deleting a bin keeps its medicines (unassigned)', async () => {
    assert.equal((await call('DELETE', `/bins/${binF}`)).status, 200);
    const r = await call('GET', '/medications?search=Insulin');
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].bin, null);
  });

  it('deleting an elder keeps their bin and clears the owner', async () => {
    await call('DELETE', `/elders/${elder}`);
    const r = await call('GET', `/bins/${binA}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.elder, null);
  });
});
