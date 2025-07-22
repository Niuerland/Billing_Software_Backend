// models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true }, // Unique numeric ID for customer
  name: { type: String, required: true, trim: true },
  contact: { type: String, required: true, unique: true, trim: true },
  aadhaar: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Validate 12 digits (after removing non-digits)
        const digits = v.replace(/\D/g, '');
        return digits.length === 0 || digits.length === 12;
      },
      message: 'Aadhaar must be 12 digits'
    }
  },
  location: { type: String, trim: true },
  // This is the total outstanding credit for this customer across all transactions
  outstandingCredit: { type: Number, default: 0 }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

// Index for faster queries
customerSchema.index({ contact: 1 });
customerSchema.index({ aadhaar: 1 }, { sparse: true }); // Sparse index since aadhaar is optional

module.exports = mongoose.model('Customer', customerSchema);