const mongoose = require('mongoose');

const BIN_COLORS = ['Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Gray'];

// A physical container/shelf spot where medicines are kept, identified by a printed label
const storageBinSchema = new mongoose.Schema(
  {
    // Short code printed on the bin's label, e.g. "A-01"
    label: {
      type: String,
      required: [true, 'Label is required'],
      trim: true,
      uppercase: true,
      maxlength: [20, 'Label must be at most 20 characters'],
      unique: true,
    },
    // Where the bin is, e.g. "Nurse station – Cabinet 2, Shelf 3"
    location: { type: String, required: [true, 'Location is required'], trim: true, maxlength: 150 },
    color: {
      type: String,
      enum: { values: BIN_COLORS, message: 'Invalid label colour' },
      default: 'Blue',
    },
    // Optional: a bin that belongs to one elder (e.g. a personal pill box)
    elder: { type: mongoose.Schema.Types.ObjectId, ref: 'Elder', default: null },
    description: { type: String, trim: true, maxlength: 150, default: '' },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StorageBin', storageBinSchema);
module.exports.BIN_COLORS = BIN_COLORS;
