const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  customer: {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    contact: { type: String, required: true },
    aadhaar: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          const digits = v.replace(/\D/g, '');
          return digits.length === 0 || digits.length === 12;
        },
        message: 'Aadhaar must be 12 digits'
      }
    },
    location: { type: String, trim: true }
  },
  cashier: {
    cashierId: { type: String, required: true },
    cashierName: { type: String, required: true },
    counterNum: { type: String, required: true },
    contactNumber: { type: String }
  },
  products: [{
    name: { type: String, required: true },
    code: { type: String },
    price: { type: Number, required: true },
    mrpPrice:{type:Number},
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    totalPrice: { type: Number },
    discount: { type: Number, default: 0 },
    basicPrice: { type: Number },
    gst: { type: Number },
    sgst: { type: Number },
    gstAmount: { type: Number },
    sgstAmount: { type: Number },
    hsnCode: { type: String }
  }],
  transportCharge: { type: Number, default: 0 },
  productSubtotal: { type: Number, required: true },
  totalGst: { type: Number, required: true },
  totalSgst: { type: Number, required: true },
  productTotalWithTax: { type: Number, required: true },
  currentBillTotal: { type: Number, required: true },
  previousOutstandingCredit: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  unpaidAmountForThisBill: { type: Number, default: 0 },
  status: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'unpaid' },
  date: { type: Date, default: Date.now },
  billNumber: { type: String, required: true, unique: true },
  payment: {
    method: { type: String },
    currentBillPayment: { type: Number },
    selectedOutstandingPayment: { type: Number },
    transactionId: { type: String }
  }
}, { timestamps: true });

module.exports = mongoose.model('Bill', billSchema);