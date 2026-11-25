const mongoose = require('mongoose');

// One entry per dose that has been marked taken or skipped
const doseLogSchema = new mongoose.Schema({
  medication: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication', required: true },
  elder: { type: mongoose.Schema.Types.ObjectId, ref: 'Elder', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  time: { type: String, required: true }, // HH:MM
  status: { type: String, enum: ['Taken', 'Skipped'], required: true },
  loggedAt: { type: Date, default: Date.now },
});

doseLogSchema.index({ medication: 1, date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model('DoseLog', doseLogSchema);
