// models/AdminProduct.js
const mongoose = require('mongoose');

const adminProductSchema = new mongoose.Schema({
  category: String,
  productName: { type: String, required: true },
  productCode: { type: String, required: true, unique: true },
  brand: String,
  baseUnit: String,
  secondaryUnit: String,
  conversionRate: Number,
  mrp: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  netPrice: Number,
  gst: { type: Number, required: true },
  sgst: Number,
  totalPrice: Number,
  stockQuantity: { type: Number, default: 0 },
  gstCategory: { type: String, enum: ['GST', 'Non-GST'], required: true },
  overallQuantity: Number,
  quantity: Number,
  discountOnMRP: Number,
  incomingDate: Date,
  expiryDate: Date,
  supplierName: String,
  batchNumber: String,
  manufactureDate: Date,
  manufactureLocation: String
}, { timestamps: true });

module.exports = mongoose.model('AdminProduct', adminProductSchema);