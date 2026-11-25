const mongoose = require('mongoose');
const { DATE_RX, localToday } = require('../utils/dates');

const elderSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 100 },
    dateOfBirth: {
      type: String,
      required: [true, 'Date of birth is required'],
      validate: {
        validator: (v) => DATE_RX.test(v) && v <= localToday(),
        message: 'Date of birth must be a valid date in the past',
      },
    },
    gender: {
      type: String,
      enum: { values: ['', 'Female', 'Male', 'Other'], message: 'Invalid gender' },
      default: '',
    },
    bloodType: {
      type: String,
      enum: { values: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], message: 'Invalid blood type' },
      default: '',
    },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    address: { type: String, trim: true, maxlength: 200, default: '' },
    conditions: [{ type: String, trim: true, maxlength: 100 }],
    allergies: [{ type: String, trim: true, maxlength: 100 }],
    emergencyContactName: { type: String, trim: true, maxlength: 100, default: '' },
    emergencyContactPhone: { type: String, trim: true, maxlength: 30, default: '' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

elderSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const [y, m, d] = this.dateOfBirth.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
});

module.exports = mongoose.model('Elder', elderSchema);
