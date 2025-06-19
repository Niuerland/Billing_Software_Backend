const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');

// POST /api/bills
router.post('/', async (req, res) => {
  try {
    const billData = req.body;
    if (!billData.customer || !billData.products || !billData.total) {
      return res.status(400).json({ message: 'Missing required bill fields' });
    }

    const newBill = new Bill(billData);
    const savedBill = await newBill.save();
    res.status(201).json({ message: 'Bill saved successfully', bill: savedBill });
  } catch (error) {
    console.error('Error saving bill:', error);
    res.status(500).json({ message: 'Server error saving bill', error: error.message });
  }
});

// GET /api/bills
router.get('/', async (req, res) => {
  try {
    const bills = await Bill.find().sort({ date: -1 }); // latest first
    res.json(bills);
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ message: 'Failed to fetch bills', error: error.message });
  }
});

module.exports = router;
