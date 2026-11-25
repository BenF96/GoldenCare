// Adds sample data so you can try GoldenCare quickly: `npm run seed`
// Only runs when the database has no elders, so it never overwrites real data.
require('dotenv').config();
const mongoose = require('mongoose');
const Elder = require('./models/Elder');
const Caregiver = require('./models/Caregiver');
const Vital = require('./models/Vital');
const Medication = require('./models/Medication');
const Appointment = require('./models/Appointment');
const HealthRecord = require('./models/HealthRecord');
const StorageBin = require('./models/StorageBin');
const { localToday } = require('./utils/dates');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/goldencare';
const daysAgo = (n, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function seed() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.log('Refusing to add sample data in production. Use `node seed.js --force` if you really want it.');
    return;
  }
  await mongoose.connect(MONGODB_URI);
  if (await Elder.countDocuments()) {
    console.log('Database already has elders – skipping seed.');
    return;
  }

  const [maria, jose] = await Elder.create([
    {
      name: 'Maria Santos', dateOfBirth: '1945-03-12', gender: 'Female', bloodType: 'O+',
      phone: '0917 555 0101', conditions: ['Hypertension', 'Type 2 Diabetes'], allergies: ['Penicillin'],
      emergencyContactName: 'Ana Santos', emergencyContactPhone: '0917 555 0199',
    },
    {
      name: 'Jose Reyes', dateOfBirth: '1940-11-02', gender: 'Male', bloodType: 'A+',
      conditions: ['Arthritis'], emergencyContactName: 'Carlo Reyes', emergencyContactPhone: '0918 555 0222',
    },
  ]);

  await Caregiver.create([
    { name: 'Ana Santos', relationship: 'Daughter', phone: '0917 555 0199', email: 'ana@example.com', elders: [maria._id] },
    { name: 'Nurse Liza Cruz', relationship: 'Nurse', phone: '0919 555 0333', elders: [maria._id, jose._id] },
  ]);

  const vitals = [];
  for (let i = 6; i >= 0; i--) {
    vitals.push({
      elder: maria._id, recordedAt: daysAgo(i), systolic: 128 + (i % 3) * 6 + (i === 0 ? 18 : 0),
      diastolic: 82 + (i % 2) * 4, heartRate: 72 + i, temperature: 36.6, oxygen: 97, bloodSugar: 140 + i * 5,
    });
    vitals.push({ elder: jose._id, recordedAt: daysAgo(i, 10), systolic: 122, diastolic: 78, heartRate: 68 + (i % 4), temperature: 36.8, oxygen: 96 });
  }
  await Vital.create(vitals);

  const [binA, binB] = await StorageBin.create([
    { label: 'A-01', location: 'Nurse station – Cabinet 1, Shelf 2', color: 'Blue', elder: maria._id, description: 'Maria’s daily pill box' },
    { label: 'B-01', location: 'Nurse station – Cabinet 2, Top drawer', color: 'Green', description: 'Pain relief (shared)' },
  ]);

  const today = localToday();
  await Medication.create([
    { elder: maria._id, name: 'Losartan', dosage: '50 mg, 1 tablet', times: ['08:00'], startDate: today, instructions: 'With water', bin: binA._id },
    { elder: maria._id, name: 'Metformin', dosage: '500 mg', times: ['08:00', '20:00'], startDate: today, instructions: 'After meals', bin: binA._id },
    { elder: jose._id, name: 'Paracetamol', dosage: '500 mg', times: ['12:00'], startDate: today, instructions: 'For joint pain', bin: binB._id },
  ]);

  await Appointment.create([
    { elder: maria._id, title: 'Cardiology check-up', dateTime: daysAgo(-3, 10), doctor: 'Dr. Lim', location: 'City Heart Center' },
    { elder: jose._id, title: 'Physical therapy', dateTime: daysAgo(-1, 14), doctor: 'PT Gomez', location: 'Rehab Clinic' },
  ]);

  await HealthRecord.create([
    { elder: maria._id, date: '2019-06-01', type: 'Diagnosis', title: 'Type 2 Diabetes', provider: 'Dr. Lim' },
    { elder: maria._id, date: '2025-10-15', type: 'Vaccination', title: 'Flu vaccine' },
    { elder: jose._id, date: '2023-02-20', type: 'Procedure', title: 'Knee X-ray', description: 'Mild osteoarthritis, right knee.' },
  ]);

  console.log('Sample data added.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
