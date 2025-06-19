// models/CashierUser.js
const mongoose = require('mongoose');

const CashierUserSchema = new mongoose.Schema({
  cashierName: { type: String, required: true },
  cashierId: { type: String, required: true },
  counterNum: { type: String, required: true },
  contactNumber: { type: String, required: true },
  password: { type: String, required: true }
});


module.exports = mongoose.model('CashierUser', CashierUserSchema);
