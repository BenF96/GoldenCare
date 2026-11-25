const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    elder: { type: mongoose.Schema.Types.ObjectId, ref: 'Elder', required: [true, 'Elder is required'] },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 150 },
    dateTime: { type: Date, required: [true, 'Date and time are required'] },
    doctor: { type: String, trim: true, maxlength: 100, default: '' },
    location: { type: String, trim: true, maxlength: 200, default: '' },
    status: {
      type: String,
      enum: { values: ['Scheduled', 'Completed', 'Cancelled', 'Missed'], message: 'Invalid status' },
      default: 'Scheduled',
    },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true }
);

appointmentSchema.index({ elder: 1, dateTime: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
