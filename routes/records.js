const { crudRouter } = require('../utils/crud');
const HealthRecord = require('../models/HealthRecord');

module.exports = crudRouter(HealthRecord, {
  fields: ['elder', 'date', 'type', 'title', 'provider', 'description'],
  filters: ['elder', 'type'],
  search: ['title', 'description', 'provider'],
  sort: { date: -1, createdAt: -1 },
});
