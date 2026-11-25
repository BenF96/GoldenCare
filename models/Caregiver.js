const mongoose = require('mongoose');

const caregiverSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 100 },
    relationship: { type: String, trim: true, maxlength: 50, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: '',
      validate: { validator: (v) => !v || /^\S+@\S+\.\S+$/.test(v), message: 'Email is not valid' },
    },
    elders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Elder' }],
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Caregiver', caregiverSchema);
