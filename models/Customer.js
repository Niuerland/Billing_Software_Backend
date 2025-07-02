const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  contact: { type: String, required: true, unique: true, trim: true }
});

module.exports = mongoose.model('Customer', customerSchema);
