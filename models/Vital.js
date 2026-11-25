const mongoose = require('mongoose');
const { evaluateVitals } = require('../utils/vitals');

const range = (min, max, label) => ({
  type: Number,
  min: [min, `${label} must be at least ${min}`],
  max: [max, `${label} must be at most ${max}`],
  default: null,
});

const MEASUREMENTS = ['systolic', 'diastolic', 'heartRate', 'temperature', 'oxygen', 'bloodSugar', 'weight'];

const vitalSchema = new mongoose.Schema(
  {
    elder: { type: mongoose.Schema.Types.ObjectId, ref: 'Elder', required: [true, 'Elder is required'] },
    recordedAt: { type: Date, required: [true, 'Date and time are required'], default: Date.now },
    systolic: range(50, 260, 'Systolic pressure'),
    diastolic: range(30, 160, 'Diastolic pressure'),
    heartRate: range(20, 250, 'Heart rate'),
    temperature: range(30, 45, 'Temperature'),
    oxygen: range(50, 100, 'Oxygen saturation'),
    bloodSugar: range(20, 600, 'Blood sugar'),
    weight: range(20, 300, 'Weight'),
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

vitalSchema.pre('validate', function (next) {
  if (MEASUREMENTS.every((f) => this[f] === null || this[f] === undefined)) {
    this.invalidate('systolic', 'Enter at least one measurement');
  }
  next();
});

// Readings outside the normal range, e.g. [{ field: 'temperature', level: 'high', message: 'Fever' }]
vitalSchema.virtual('alerts').get(function () {
  return evaluateVitals(this);
});

vitalSchema.index({ elder: 1, recordedAt: -1 });

module.exports = mongoose.model('Vital', vitalSchema);
