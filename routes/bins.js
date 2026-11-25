const { crudRouter } = require('../utils/crud');
const StorageBin = require('../models/StorageBin');
const Medication = require('../models/Medication');

module.exports = crudRouter(StorageBin, {
  fields: ['label', 'location', 'color', 'elder', 'description', 'notes'],
  filters: ['elder', 'color'],
  search: ['label', 'location', 'description'],
  sort: { label: 1 },
  populate: { path: 'elder', select: 'name' },
  // Medicines in a deleted bin become "not assigned" (they are not deleted)
  beforeDelete: (bin) => Medication.updateMany({ bin: bin._id }, { bin: null }),
});
