// models/Bill.js
const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  customer: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    contact: { type: String, required: true }
  },
  products: [{
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    gst: { type: Number, required: true },
    mrp: { type: Number, required: true },
    discount: { type: Number, default: 0 }
  }],
  subtotal: { type: Number, required: true },
  gst: { type: Number, required: true },
  total: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  billNumber: { type: String, required: true, unique: true },
  payment: {
    method: { type: String },
    amountPaid: { type: Number },
    transactionId: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Bill', billSchema);