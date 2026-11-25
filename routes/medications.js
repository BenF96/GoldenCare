const { crudRouter, wrap, HttpError } = require('../utils/crud');
const Medication = require('../models/Medication');
const DoseLog = require('../models/DoseLog');
const { DATE_RX, resolveDate } = require('../utils/dates');
const { buildSchedule, caregiverElderIds } = require('../utils/schedule');

module.exports = crudRouter(Medication, {
  fields: ['elder', 'name', 'dosage', 'times', 'startDate', 'endDate', 'instructions', 'active', 'bin'],
  filters: ['elder', 'bin'],
  search: ['name'],
  sort: { active: -1, name: 1 },
  populate: [
    { path: 'bin', select: 'label location color' },
    { path: 'elder', select: 'name' },
  ],
  beforeDelete: (med) => DoseLog.deleteMany({ medication: med._id }),
  // Deleted medicines go to "Recently deleted" and can be restored for 30 days
  trash: { retentionDays: 30, populate: { path: 'elder', select: 'name' } },

  extend: (router) => {
    // GET /api/medications/schedule?date=YYYY-MM-DD[&elder=id][&caregiver=id]
    // Every dose due that day and whether it was taken.
    router.get(
      '/schedule',
      wrap(async (req, res) => {
        const date = resolveDate(req.query.date);
        const scope = {};
        if (req.query.elder) scope.elder = String(req.query.elder);
        else if (req.query.caregiver) scope.elder = { $in: await caregiverElderIds(req.query.caregiver) };
        res.json(await buildSchedule(date, scope));
      })
    );

    // POST /api/medications/:id/doses  { date, time, status: Taken | Skipped | Pending }
    // Marks a dose as taken/skipped ("Pending" undoes it).
    router.post(
      '/:id/doses',
      wrap(async (req, res) => {
        const med = await Medication.findOne({ _id: req.params.id, deletedAt: null });
        if (!med) throw new HttpError(404, 'Medication not found');
        const { date, time, status } = req.body || {};
        if (!DATE_RX.test(date || '') || !med.times.includes(time)) {
          throw new HttpError(400, 'Invalid date or time for this medication');
        }
        if (status === 'Pending') {
          await DoseLog.deleteOne({ medication: med._id, date, time });
          return res.json({ status: 'Pending' });
        }
        if (!['Taken', 'Skipped'].includes(status)) throw new HttpError(400, 'Invalid status');
        const log = await DoseLog.findOneAndUpdate(
          { medication: med._id, date, time },
          { elder: med.elder, status, loggedAt: new Date() },
          { upsert: true, new: true, runValidators: true }
        );
        res.json(log);
      })
    );
  },
});
