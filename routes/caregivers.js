const { crudRouter } = require('../utils/crud');
const Caregiver = require('../models/Caregiver');

module.exports = crudRouter(Caregiver, {
  fields: ['name', 'relationship', 'phone', 'email', 'elders', 'notes'],
  filters: ['elders'], // ?elders=<elderId> → caregivers of that elder
  search: ['name', 'relationship'],
  sort: { name: 1 },
  populate: { path: 'elders', select: 'name' },
});
