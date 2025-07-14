const express = require('express');
const router = express.Router();
const AdminProduct = require('../models/AdminProduct');
const StockQuantity = require('../models/StockQuantity'); // <-- Stock model


router.get('/calculate-price/:code', async (req, res) => {
  try {
    const { unit, quantity } = req.query;
    const product = await AdminProduct.findOne({ productCode: req.params.code });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let price = 0;
    
    // Calculate price based on selected unit
    if (unit === product.baseUnit) {
      price = product.basePrice * quantity;
    } else if (unit === product.secondaryUnit) {
      price = product.secondaryPrice * quantity;
    } else if (product.unitPrices[unit]) {
      price = product.unitPrices[unit] * quantity;
    } else {
      // Handle conversions if needed
      if (unit === 'gram' && product.baseUnit === 'kg') {
        price = (product.basePrice / 1000) * quantity;
      } else if (unit === 'ml' && product.baseUnit === 'liter') {
        price = (product.basePrice / 1000) * quantity;
      } else {
        return res.status(400).json({ error: 'Invalid unit conversion' });
      }
    }

    res.json({ price: parseFloat(price.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: 'Error calculating price', details: err.message });
  }
});

// ✅ POST - Add new product and sync stock
router.post('/', async (req, res) => {
  try {

    // Initialize conversionRate with a default value of 1 if not provided

    // ✅ Validate GST Category
    if (!req.body.gstCategory || !['GST', 'Non-GST'].includes(req.body.gstCategory)) {
      return res.status(400).json({ error: 'GST Category must be either "GST" or "Non-GST"' });
    }

    // ✅ Calculate overallQuantity before saving

    const conversionRate = req.body.conversionRate || 1;
    const stockQuantity = req.body.stockQuantity || 0;
    
    // Calculate overallQuantity
    req.body.overallQuantity = stockQuantity * conversionRate;

    // Calculate unit prices
    const basePrice = req.body.basePrice || req.body.mrp || 0;
    req.body.unitPrices = {
      piece: req.body.baseUnit === 'piece' ? basePrice : 0,
      box: req.body.baseUnit === 'box' ? basePrice : 0,
      kg: req.body.baseUnit === 'kg' ? basePrice : 0,
      gram: req.body.baseUnit === 'gram' ? basePrice : (req.body.baseUnit === 'kg' ? basePrice / 1000 : 0),
      liter: req.body.baseUnit === 'liter' ? basePrice : 0,
      ml: req.body.baseUnit === 'ml' ? basePrice : (req.body.baseUnit === 'liter' ? basePrice / 1000 : 0),
      bag: req.body.baseUnit === 'bag' ? basePrice : 0,
      packet: req.body.baseUnit === 'packet' ? basePrice : 0,
      bottle: req.body.baseUnit === 'bottle' ? basePrice : 0
    };

    // Calculate secondary price if secondary unit exists
    if (req.body.secondaryUnit && conversionRate) {
      req.body.secondaryPrice = basePrice / conversionRate;
    }

    const product = new AdminProduct(req.body);
    const savedProduct = await product.save();

    // ✅ Sync with StockQuantity
    const existingStock = await StockQuantity.findOne({ productCode: savedProduct.productCode });

    if (existingStock) {
      existingStock.totalQuantity += savedProduct.stockQuantity;
      existingStock.availableQuantity += savedProduct.stockQuantity;
      existingStock.updatedAt = new Date();
      await existingStock.save();
    } else {
      const newStock = new StockQuantity({
        productCode: savedProduct.productCode,
        productName: savedProduct.productName,
        totalQuantity: savedProduct.stockQuantity,
        availableQuantity: savedProduct.stockQuantity,
        sellingQuantity: 0,
        updatedAt: new Date()
      });
      await newStock.save();
    }

    res.status(201).json(savedProduct);
  } catch (err) {
    console.error('❌ Error saving product and syncing stock:', err);
    res.status(500).json({ 
      error: 'Failed to save product', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
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