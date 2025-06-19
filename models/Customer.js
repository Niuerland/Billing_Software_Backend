const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true }, // match your customer id
  name: { type: String, required: true },
  contact: { type: String }
});

module.exports = mongoose.model('Customer', customerSchema);
