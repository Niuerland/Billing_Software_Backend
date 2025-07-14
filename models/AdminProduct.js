const mongoose = require('mongoose');

const adminProductSchema = new mongoose.Schema({
  category: String,
  productName: { type: String, required: true },
  productCode: { type: String, required: true, unique: true },
  brand: String,
  mrp: { type: Number},
  sellerPrice: { type: Number, required: true },  // Price at which you bought
  profit: { type: Number, required: true },       // Calculated profit (MRP - SellerPrice)
  discount: { type: Number, default: 0 },
  netPrice: Number,
  mrpPrice: Number,
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
  }
}, { timestamps: true });

adminProductSchema.pre('save', function(next) {
  // Calculate overall quantity whenever stockQuantity or conversionRate changes
  if (this.isModified('stockQuantity') || this.isModified('conversionRate')) {
    this.overallQuantity = this.stockQuantity * (this.conversionRate || 1);
  }
  next();
});

module.exports = mongoose.model('AdminProduct', adminProductSchema);