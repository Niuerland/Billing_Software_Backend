const mongoose = require('mongoose');

const StockHistorySchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminProduct' }, // Changed ref to 'AdminProduct'
    previousStock: { type: Number, required: true },
    addedStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    supplierName: { type: String },
    batchNumber: { type: String },
    manufactureDate: { type: Date },
    expiryDate: { type: Date },
    mrp: { type: Number },
    sellerPrice: { type: Number },
    updatedBy: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StockHistory', StockHistorySchema);