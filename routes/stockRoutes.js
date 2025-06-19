const express = require('express');
const router = express.Router();
const StockQuantity = require('../models/StockQuantity');

// 🔹 Add or Update stock from Admin Panel
router.post('/add', async (req, res) => {
  const { productCode, productName, quantity } = req.body;

  try {
    let stock = await StockQuantity.findOne({ productCode });

    if (stock) {
      stock.totalQuantity += quantity;
      stock.availableQuantity += quantity;
    } else {
      stock = new StockQuantity({
        productCode,
        productName,
        totalQuantity: quantity,
        availableQuantity: quantity
      });
    }

    await stock.save();
    res.json({ message: 'Stock updated', stock });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stock', details: err.message });
  }
});

// 🔹 Reduce stock on purchase
router.patch('/reduce/:code', async (req, res) => {
  const { quantity } = req.body;

  try {
    const stock = await StockQuantity.findOne({ productCode: req.params.code });
    if (!stock) return res.status(404).json({ error: 'Product stock not found' });

    if (stock.availableQuantity < quantity)
      return res.status(400).json({ error: 'Insufficient stock' });

    stock.availableQuantity -= quantity;
    stock.sellingQuantity += quantity;

    await stock.save();
    res.json({ message: 'Stock reduced', stock });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reduce stock', details: err.message });
  }
});

// 🔹 Get all stock info
router.get('/', async (req, res) => {
  try {
    const allStock = await StockQuantity.find();
    res.json(allStock);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching stock data' });
  }
});

module.exports = router;
