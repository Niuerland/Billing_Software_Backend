const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  customer: {
    id: Number,
    name: String,
    contact: String
  },
  products: [
    {
      name: String,
      price: Number,
      quantity: Number,
      gst: Number
    }
  ],
  subtotal: Number,
  gst: Number,
  total: Number,
  date: { type: Date, default: Date.now },
  billNumber: String,
  payment: Object
});

module.exports = mongoose.model('Bill', billSchema);
