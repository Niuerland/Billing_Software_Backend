const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const StockQuantity = require('../models/StockQuantity');

// ✅ GET /api/bills
router.get('/', async (req, res) => {
  try {
    const bills = await Bill.find();
    res.status(200).json(bills);
  } catch (err) {
    console.error('Error fetching bills:', err);
    res.status(500).json({ message: 'Failed to fetch bills' });
  }
});

// ✅ POST /api/bills
router.post('/', async (req, res) => {
  try {
    const billData = req.body;

    if (!billData.customer || !billData.products || !billData.total) {
      return res.status(400).json({
        message: 'Missing required bill fields',
        received: {
          customer: billData.customer,
          products: billData.products,
          total: billData.total
        }
      });
    }


    for (const item of billData.products) {
      const stock = await StockQuantity.findOne({ productName: item.name });
      const available = stock?.availableQuantity || 0;

      if (item.quantity > available) {
        return res.status(400).json({
          message: `Only ${available} units available for ${item.name}. Cannot proceed with ${item.quantity}.`
        });
      }
    }

    const newBill = new Bill(billData);
    const savedBill = await newBill.save();

    for (const item of billData.products) {
      const stock = await StockQuantity.findOne({ productName: item.name });

      stock.availableQuantity -= item.quantity;
      stock.sellingQuantity += item.quantity;
      stock.updatedAt = new Date();
      await stock.save();
    }

    res.status(201).json({ message: 'Bill saved and stock updated', bill: savedBill });
  } catch (error) {
    console.error('Error saving bill:', error);
    res.status(500).json({ message: 'Server error saving bill', error: error.message });
  }
});

module.exports = router;
