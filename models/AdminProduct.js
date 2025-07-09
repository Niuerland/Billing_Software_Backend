const mongoose = require('mongoose');

const adminProductSchema = new mongoose.Schema({
  category: String,
  productName: { type: String, required: true },
  productCode: { type: String, required: true, unique: true },
  brand: String,
  mrp: { type: Number, required: true }, // Display price based on selected unit
  discount: { type: Number, default: 0 },
  netPrice: Number,
  gst: { type: Number, required: true },
  sgst: Number,
  totalPrice: Number,
  stockQuantity: { type: Number, default: 0 },
  overallQuantity: Number,
  quantity: Number,
  discountOnMRP: Number,
  incomingDate: Date,
  expiryDate: Date,
  supplierName: String,
  batchNumber: String,
  manufactureDate: Date,
  manufactureLocation: String,
   baseUnit: { type: String, required: true },
  secondaryUnit: String,
  conversionRate: { type: Number, default: 1 },
  basePrice: Number,
  secondaryPrice: Number,
  unitPrices: {
    piece: Number,
    box: Number,
    kg: Number,
    gram: Number,
    liter: Number,
    ml: Number,
    bag: Number,
    packet: Number,
    bottle: Number
  },
}, { timestamps: true });

module.exports = mongoose.model('AdminProduct', adminProductSchema);