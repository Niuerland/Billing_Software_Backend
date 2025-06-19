const mongoose = require('mongoose');

const adminProductSchema = new mongoose.Schema({
  category: String,
  productName: String,
  productCode: { type: String, required: true, unique: true }, // Unique identifier
  brand: String,
  baseUnit: String,
  secondaryUnit: String,
  conversionRate: Number,
  mrp: Number,
  discount: Number,
  netPrice: Number,
  gst: Number,
  sgst: Number,
  totalPrice: Number,
  stockQuantity: Number, // Product stock
  quantity: Number, // Not usually needed here, mainly in orders
  discountOnMRP: Number,
  incomingDate: String,
  expiryDate: String,
  supplierName: String,
  batchNumber: String,
  manufactureDate: String,
  manufactureLocation: String
});

module.exports = mongoose.model('AdminProduct', adminProductSchema, 'adminproducts');
