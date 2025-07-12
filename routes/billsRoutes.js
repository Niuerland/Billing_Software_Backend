const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const StockQuantity = require('../models/StockQuantity');
const AdminProduct = require('../models/AdminProduct');

router.get('/', async (req, res) => {
  try {
    const bills = await Bill.find();
    res.status(200).json(bills);
  } catch (err) {
    console.error('Error fetching bills:', err);
    res.status(500).json({ message: 'Failed to fetch bills' });
  }
});

router.post('/', async (req, res) => {
  try {
    const billData = req.body;

    // Validate required fields
    if (!billData.customer || !billData.products || !billData.total) {
      return res.status(400).json({
        message: 'Missing required bill fields'
      });
    }

    // Check stock availability with unit conversion
    for (const item of billData.products) {
      const product = await AdminProduct.findOne({ productName: item.name });
      if (!product) {
        return res.status(400).json({
          message: `Product ${item.name} not found`
        });
      }

      const stock = await StockQuantity.findOne({ productCode: product.productCode });
      const availableInBaseUnits = stock?.availableQuantity || 0;
      
      // Convert requested quantity to base units based on the selected unit
      let requestedInBaseUnits;
      if (item.unit === product.baseUnit) {
        requestedInBaseUnits = item.quantity;
      } else if (item.unit === product.secondaryUnit) {
        requestedInBaseUnits = item.quantity / (product.conversionRate || 1);
      } else {
        // Handle other units if needed
        requestedInBaseUnits = item.quantity; // Default to assuming it's in base units
      }

      if (requestedInBaseUnits > availableInBaseUnits) {
        const availableInDisplayUnits = availableInBaseUnits * 
          (item.unit === product.secondaryUnit ? (product.conversionRate || 1) : 1);
        return res.status(400).json({
          message: `Only ${availableInDisplayUnits} ${item.unit} available for ${item.name}. Cannot proceed with ${item.quantity}.`
        });
      }
    }

    const newBill = new Bill(billData);
    const savedBill = await newBill.save();

    // Update stock quantities with unit conversion
    for (const item of billData.products) {
      const product = await AdminProduct.findOne({ productName: item.name });
      const stock = await StockQuantity.findOne({ productCode: product.productCode });

      if (stock) {
        const conversionRate = product.conversionRate || 1;
        
        // Convert sold quantity to base units based on the selected unit
        let quantityInBaseUnits;
        if (item.unit === product.baseUnit) {
          quantityInBaseUnits = item.quantity;
        } else if (item.unit === product.secondaryUnit) {
          quantityInBaseUnits = item.quantity / conversionRate;
        } else {
          quantityInBaseUnits = item.quantity; // Default to base units
        }

        stock.availableQuantity -= quantityInBaseUnits;
        stock.sellingQuantity += quantityInBaseUnits;
        stock.updatedAt = new Date();
        await stock.save();

        // Also update the AdminProduct stock
        // product.stockQuantity -= quantityInBaseUnits;
        // product.overallQuantity = product.stockQuantity * conversionRate;
        // await product.save();
      }
    }

    res.status(201).json({ message: 'Bill saved and stock updated', bill: savedBill });
  } catch (error) {
    console.error('Error saving bill:', error);
    res.status(500).json({ 
      message: 'Server error saving bill', 
      error: error.message
    });
  }
});

module.exports = router;