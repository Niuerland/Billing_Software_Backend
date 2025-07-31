const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  contact: { type: String, required: true, unique: true, trim: true },
  aadhaar: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        const digits = v.replace(/\D/g, '');
        return digits.length === 0 || digits.length === 12;
      },
      message: 'Aadhaar must be 12 digits'
    }
  },
  location: { type: String, trim: true },
  outstandingCredit: { type: Number, default: 0 }
}, {
  timestamps: true
});

// ✅ Only one manual index needed (aadhaar is optional)
customerSchema.index({ aadhaar: 1 }, { sparse: true });

module.exports = mongoose.model('Customer', customerSchema);
