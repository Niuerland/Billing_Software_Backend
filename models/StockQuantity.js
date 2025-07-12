const mongoose = require('mongoose');

const stockQuantitySchema = new mongoose.Schema({
  productCode: { type: String, required: true, unique: true },
  productName: String,
  totalQuantity: { type: Number, default: 0 },      // In base units
  availableQuantity: { type: Number, default: 0 },  // In base units
  sellingQuantity: { type: Number, default: 0 },    // In base units
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StockQuantity', stockQuantitySchema);