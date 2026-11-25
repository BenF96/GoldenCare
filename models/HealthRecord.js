const mongoose = require('mongoose');
const { DATE_RX } = require('../utils/dates');

const RECORD_TYPES = ['Diagnosis', 'Procedure', 'Lab Result', 'Vaccination', 'Allergy', 'Hospital Visit', 'Note'];

const healthRecordSchema = new mongoose.Schema(
  {
    elder: { type: mongoose.Schema.Types.ObjectId, ref: 'Elder', required: [true, 'Elder is required'] },
    date: { type: String, required: [true, 'Date is required'], match: [DATE_RX, 'Date is not valid'] },
    type: {
      type: String,
      enum: { values: RECORD_TYPES, message: 'Invalid record type' },
      default: 'Note',
    },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 150 },
    provider: { type: String, trim: true, maxlength: 150, default: '' },
    description: { type: String, trim: true, maxlength: 3000, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
module.exports.RECORD_TYPES = RECORD_TYPES;
