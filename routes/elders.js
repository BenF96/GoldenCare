const { crudRouter } = require('../utils/crud');
const Elder = require('../models/Elder');
const Vital = require('../models/Vital');
const Medication = require('../models/Medication');
const DoseLog = require('../models/DoseLog');
const Appointment = require('../models/Appointment');
const HealthRecord = require('../models/HealthRecord');
const Caregiver = require('../models/Caregiver');
const StorageBin = require('../models/StorageBin');

module.exports = crudRouter(Elder, {
  fields: [
    'name', 'dateOfBirth', 'gender', 'bloodType', 'phone', 'address',
    'conditions', 'allergies', 'emergencyContactName', 'emergencyContactPhone', 'notes',
  ],
  search: ['name'],
  sort: { name: 1 },
  // Remove everything that belongs to the elder
  beforeDelete: async (elder) => {
    const q = { elder: elder._id };
    await Promise.all([
      Vital.deleteMany(q),
      Medication.deleteMany(q),
      DoseLog.deleteMany(q),
      Appointment.deleteMany(q),
      HealthRecord.deleteMany(q),
      Caregiver.updateMany({ elders: elder._id }, { $pull: { elders: elder._id } }),
      StorageBin.updateMany({ elder: elder._id }, { elder: null }), // keep the bin, drop the owner
    ]);
  },
});
