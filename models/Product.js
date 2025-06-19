const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  gst: { type: Number, default: 0 } // To match your GST in frontend
});

module.exports = mongoose.model('Product', productSchema);
