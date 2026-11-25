const mongoose = require('mongoose');
const { DATE_RX, TIME_RX } = require('../utils/dates');

const medicationSchema = new mongoose.Schema(
  {
    elder: { type: mongoose.Schema.Types.ObjectId, ref: 'Elder', required: [true, 'Elder is required'] },
    name: { type: String, required: [true, 'Medication name is required'], trim: true, maxlength: 100 },
    dosage: { type: String, required: [true, 'Dosage is required'], trim: true, maxlength: 100 },
    // Daily times to take it, 24h "HH:MM"
    times: {
      type: [String],
      // Normalise ("8:00" → "08:00"), remove duplicates and sort, so each dose appears once
      set: (arr) =>
        Array.isArray(arr) ? [...new Set(arr.map((t) => String(t).trim().padStart(5, '0')))].sort() : arr,
      validate: {
        validator: (arr) => arr.length > 0 && arr.every((t) => TIME_RX.test(t)),
        message: 'Enter at least one time as HH:MM, e.g. 08:00, 20:00',
      },
    },
    startDate: {
      type: String,
      required: [true, 'Start date is required'],
      match: [DATE_RX, 'Start date is not valid'],
    },
    endDate: {
      type: String,
      default: '',
      validate: { validator: (v) => !v || DATE_RX.test(v), message: 'End date is not valid' },
    },
    instructions: { type: String, trim: true, maxlength: 300, default: '' },
    active: { type: Boolean, default: true },
    // Storage bin where the medicine is physically kept
    bin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StorageBin',
      default: null,
      validate: {
        validator: async (v) => !v || Boolean(await mongoose.model('StorageBin').exists({ _id: v })),
        message: 'Storage bin not found',
      },
    },
    // Set when the medicine is moved to "Recently deleted"; null = not deleted
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

medicationSchema.pre('validate', function (next) {
  if (this.endDate && this.startDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date cannot be before the start date');
  }
  next();
});

medicationSchema.index({ elder: 1, deletedAt: 1 });
medicationSchema.index({ bin: 1 });

module.exports = mongoose.model('Medication', medicationSchema);
