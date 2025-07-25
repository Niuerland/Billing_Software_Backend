const mongoose = require('mongoose');

const sellerBillSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Seller'
  },
  supplierName: {
    type: String,
    required: true,
    trim: true
  },
  batchNumber: {
    type: String,
    required: true,
    trim: true
  },
  billType: {
    type: String,
    enum: ['gst', 'non-gst'],
    required: true
  },
  billNumber: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  billDate: {
    type: Date,
    required: [true, 'Bill date is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  filePath: {
    type: String,
    required: [true, 'File path is required']
  },
  fileName: {
    type: String,
    required: [true, 'File name is required']
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: {
    type: Date
  }
}, { 
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.filePath;
      return ret;
    }
  }
});

// Add index for better performance
sellerBillSchema.index({ sellerId: 1 });
sellerBillSchema.index({ billType: 1 });
sellerBillSchema.index({ billNumber: 1 }, { unique: true });

module.exports = mongoose.model('SellerBill', sellerBillSchema);