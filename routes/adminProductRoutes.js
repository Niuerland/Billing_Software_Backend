const express = require('express');
const router = express.Router();
const AdminProduct = require('../models/AdminProduct');
const StockQuantity = require('../models/StockQuantity'); // <-- Stock model

// ✅ POST - Add new product and sync stock
// ✅ POST - Add new product and sync stock
router.post('/', async (req, res) => {
  try {
    // ✅ Validate GST Category
    if (!req.body.gstCategory || !['GST', 'Non-GST'].includes(req.body.gstCategory)) {
      return res.status(400).json({ error: 'GST Category must be either "GST" or "Non-GST"' });
    }

    // ✅ Calculate overallQuantity before saving
    const conversionRate = req.body.conversionRate || 1;
    const stockQuantity = req.body.stockQuantity || 0;
    req.body.overallQuantity = stockQuantity * conversionRate;

    const product = new AdminProduct(req.body);
    const savedProduct = await product.save();

    // ✅ Sync with StockQuantity
    const existingStock = await StockQuantity.findOne({ productCode: savedProduct.productCode });

    if (existingStock) {
      existingStock.totalQuantity += savedProduct.overallQuantity;
      existingStock.availableQuantity += savedProduct.overallQuantity;
      existingStock.updatedAt = new Date();
      await existingStock.save();
    } else {
      const newStock = new StockQuantity({
        productCode: savedProduct.productCode,
        productName: savedProduct.productName,
        totalQuantity: savedProduct.overallQuantity,
        availableQuantity: savedProduct.overallQuantity,
        sellingQuantity: 0,
        updatedAt: new Date()
      });
      await newStock.save();
    }

    res.status(201).json(savedProduct);
  } catch (err) {
    console.error('❌ Error saving product and syncing stock:', err);
    res.status(500).json({ error: 'Failed to save product', details: err.message });
  }
});

// ✅ GET - All products
router.get('/', async (req, res) => {
  try {
    const products = await AdminProduct.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load products' });
  }
});

// ✅ GET - Product by productCode (for auto-fill)
router.get('/code/:code', async (req, res) => {
  try {
    const product = await AdminProduct.findOne({ productCode: req.params.code });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching product by code' });
  }
});

// ✅ PATCH - Decrease stock quantity when billed (optional, if still used)// ✅ PATCH - Decrease stock quantity when billed
router.patch('/reduce-stock/:code', async (req, res) => {
  const { quantity } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than 0' });
  }

  try {
    const product = await AdminProduct.findOne({ productCode: req.params.code });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Calculate the overall quantity to reduce
    const conversionRate = product.conversionRate || 1;
    const overallQuantityToReduce = quantity * conversionRate;

    if (product.overallQuantity < overallQuantityToReduce) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    // Update both stockQuantity and overallQuantity
    product.stockQuantity -= quantity;
    product.overallQuantity -= overallQuantityToReduce;
    
    await product.save();
    
    // Also update the StockQuantity collection
    const stock = await StockQuantity.findOne({ productCode: req.params.code });
    if (stock) {
      stock.availableQuantity -= overallQuantityToReduce;
      await stock.save();
    }

    res.json({ message: 'Stock updated', updatedProduct: product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stock', details: err.message });
  }
});

module.exports = router;
