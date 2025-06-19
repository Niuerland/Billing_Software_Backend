// models/AdminCredential.js
const mongoose = require('mongoose');

const AdminCredentialSchema = new mongoose.Schema({
  username: { type: String, required: true },
  contactNumber: { type: String, required: true },
  password: { type: String, required: true },
});

module.exports = mongoose.model('AdminCredential', AdminCredentialSchema);
