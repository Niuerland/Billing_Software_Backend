// models/StockQuantity.js
const mongoose = require('mongoose');

const stockQuantitySchema = new mongoose.Schema({
  productCode: { type: String, required: true, unique: true },
  productName: String,
  totalQuantity: { type: Number, default: 0 },      // Total added via admin
  availableQuantity: { type: Number, default: 0 },  // Remaining for sale
  sellingQuantity: { type: Number, default: 0 },    // Already sold
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StockQuantity', stockQuantitySchema);
