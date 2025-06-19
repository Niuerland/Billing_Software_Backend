const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },
    phoneNumber: { type: String },
    gstin: { type: String },
    email: { type: String },
    businessType: { type: String },
    businessCategory: { type: String },
    state: { type: String },
    pincode: { type: String },
    address: { type: String },
    logoUrl: { type: String },
    signatureUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);
