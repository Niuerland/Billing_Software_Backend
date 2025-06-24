const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const StockQuantity = require('../models/StockQuantity'); // Use StockQuantity here

// POST /api/bills
router.post('/', async (req, res) => {
  try {
    const billData = req.body;

    if (!billData.customer || !billData.products || !billData.total) {
      return res.status(400).json({ message: 'Missing required bill fields' });
    }

    // 1. Save the bill
    const newBill = new Bill(billData);
    const savedBill = await newBill.save();

    // 2. Update stock quantities
    for (const item of billData.products) {
      const stock = await StockQuantity.findOne({ productName: item.name });

      if (stock) {
        if (stock.availableQuantity >= item.quantity) {
          stock.availableQuantity -= item.quantity;
          stock.sellingQuantity += item.quantity;
          stock.updatedAt = new Date();
          await stock.save();
        } else {
          console.warn(`Insufficient stock for ${item.name}`);
        }
      } else {
        console.warn(`Product not found in StockQuantity: ${item.name}`);
      }
    }

    res.status(201).json({ message: 'Bill saved and stock updated', bill: savedBill });
  } catch (error) {
    console.error('Error saving bill:', error);
    res.status(500).json({ message: 'Server error saving bill', error: error.message });
  }
});

module.exports = router;
