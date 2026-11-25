const express = require('express');
const { wrap } = require('../utils/crud');
const Elder = require('../models/Elder');
const Vital = require('../models/Vital');
const Appointment = require('../models/Appointment');
const { resolveDate } = require('../utils/dates');
const { buildSchedule, caregiverElderIds } = require('../utils/schedule');

const router = express.Router();

// GET /api/dashboard?date=YYYY-MM-DD[&caregiver=id]
// Health overview for each elder (or only the elders a caregiver looks after).
router.get(
  '/',
  wrap(async (req, res) => {
    const date = resolveDate(req.query.date);
    const filter = req.query.caregiver ? { _id: { $in: await caregiverElderIds(req.query.caregiver) } } : {};
    const elders = await Elder.find(filter).sort({ name: 1 });
    const now = new Date();

    const overview = await Promise.all(
      elders.map(async (elder) => {
        const [latestVital, nextAppointment, doses] = await Promise.all([
          Vital.findOne({ elder: elder._id }).sort({ recordedAt: -1 }),
          Appointment.findOne({ elder: elder._id, status: 'Scheduled', dateTime: { $gte: now } }).sort({ dateTime: 1 }),
          buildSchedule(date, { elder: elder._id }),
        ]);
        return { elder, latestVital, nextAppointment, doses };
      })
    );

    res.json(overview);
  })
);

module.exports = router;
