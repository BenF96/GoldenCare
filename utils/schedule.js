const Medication = require('../models/Medication');
const DoseLog = require('../models/DoseLog');
const Caregiver = require('../models/Caregiver');
const { HttpError } = require('./crud');

// Mongo filter for medications that are active on a given YYYY-MM-DD date
const activeOn = (date) => ({
  active: true,
  deletedAt: null, // medicines in the bin are not scheduled
  startDate: { $lte: date },
  $or: [{ endDate: null }, { endDate: '' }, { endDate: { $gte: date } }],
});

/**
 * Returns every scheduled dose for a date, with its status (Taken / Skipped / Pending).
 * `scope` is an extra filter such as { elder: id } or { elder: { $in: ids } }.
 */
async function buildSchedule(date, scope = {}) {
  const meds = await Medication.find({ ...scope, ...activeOn(date) })
    .populate('elder', 'name')
    .populate('bin', 'label location color');
  const logs = await DoseLog.find({ date, medication: { $in: meds.map((m) => m._id) } });
  const logMap = new Map(logs.map((l) => [`${l.medication}|${l.time}`, l]));

  return meds
    .flatMap((m) =>
      [...new Set(m.times)].map((time) => {
        const log = logMap.get(`${m._id}|${time}`);
        return {
          medicationId: m._id,
          name: m.name,
          dosage: m.dosage,
          instructions: m.instructions,
          elder: m.elder ? { _id: m.elder._id, name: m.elder.name } : null,
          // Where to find the medicine
          bin: m.bin ? { _id: m.bin._id, label: m.bin.label, location: m.bin.location, color: m.bin.color } : null,
          date,
          time,
          status: log ? log.status : 'Pending',
          loggedAt: log ? log.loggedAt : null,
        };
      })
    )
    .sort((a, b) => a.time.localeCompare(b.time) || (a.elder?.name || '').localeCompare(b.elder?.name || ''));
}

// IDs of the elders a caregiver looks after
async function caregiverElderIds(caregiverId) {
  const caregiver = await Caregiver.findById(String(caregiverId));
  if (!caregiver) throw new HttpError(404, 'Caregiver not found');
  return caregiver.elders;
}

module.exports = { buildSchedule, caregiverElderIds, activeOn };
