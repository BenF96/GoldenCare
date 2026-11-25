const { crudRouter } = require('../utils/crud');
const Appointment = require('../models/Appointment');

module.exports = crudRouter(Appointment, {
  fields: ['elder', 'title', 'dateTime', 'doctor', 'location', 'status', 'notes'],
  filters: ['elder', 'status'],
  search: ['title', 'doctor', 'location'],
  sort: { dateTime: 1 },
  // ?upcoming=1 → only future appointments
  extraQuery: (req) => (req.query.upcoming ? { dateTime: { $gte: new Date() } } : {}),
});
