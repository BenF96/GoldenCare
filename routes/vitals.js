const { crudRouter } = require('../utils/crud');
const Vital = require('../models/Vital');

module.exports = crudRouter(Vital, {
  fields: ['elder', 'recordedAt', 'systolic', 'diastolic', 'heartRate', 'temperature', 'oxygen', 'bloodSugar', 'weight', 'notes'],
  filters: ['elder'],
  sort: { recordedAt: -1 },
});
