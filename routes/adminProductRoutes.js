const express = require('express');
const router = express.Router();
const AdminProduct = require('../models/AdminProduct');

// POST - Add new product
router.post('/', async (req, res) => {
  try {
    const product = new AdminProduct(req.body);
    const saved = await product.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save product', details: err.message });
  }
});

// GET - All products
router.get('/', async (req, res) => {
  try {
    const products = await AdminProduct.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load products' });
  }
});

// GET - Product by productCode (for auto-fill)
router.get('/code/:code', async (req, res) => {
  try {
    const product = await AdminProduct.findOne({ productCode: req.params.code });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching product by code' });
  }
});

// PATCH - Decrease stock quantity when billed
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

    if (product.stockQuantity < quantity) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    product.stockQuantity -= quantity;
    await product.save();
    res.json({ message: 'Stock updated', updatedProduct: product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stock', details: err.message });
  }
});

module.exports = router;
