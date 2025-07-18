const express = require('express');
const mongoose = require('mongoose'); // Add this line
const router = express.Router();
const AdminProduct = require('../models/AdminProduct');
const StockQuantity = require('../models/StockQuantity');
const StockHistory = require('../models/StockHistory'); 

router.get('/calculate-price/:code', async (req, res) => {
  try {
    const { unit, quantity } = req.query;
    const product = await AdminProduct.findOne({ productCode: req.params.code });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let price = 0;
    
    if (unit === product.baseUnit) {
      price = product.basePrice * quantity;
    } else if (unit === product.secondaryUnit) {
      price = product.secondaryPrice * quantity;
    } else if (product.unitPrices[unit]) {
      price = product.unitPrices[unit] * quantity;
    } else {
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

router.post('/', async (req, res) => {
  try {
    if (!req.body.gstCategory || !['GST', 'Non-GST'].includes(req.body.gstCategory)) {
      return res.status(400).json({ error: 'GST Category must be either "GST" or "Non-GST"' });
    }

    const conversionRate = req.body.conversionRate || 1;
    const stockQuantity = req.body.stockQuantity || 0;
    
    req.body.overallQuantity = stockQuantity * conversionRate;

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

    if (req.body.secondaryUnit && conversionRate) {
      req.body.secondaryPrice = basePrice / conversionRate;
    }

    const product = new AdminProduct(req.body);
    const savedProduct = await product.save();

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

router.get('/', async (req, res) => {
    try {
        const products = await AdminProduct.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/profit-summary', async (req, res) => {
    try {
        const products = await AdminProduct.find();
        const totalProfit = products.reduce((sum, product) => sum + product.profit, 0);
        
        res.json({
            totalProducts: products.length,
            totalProfit,
            averageProfit: totalProfit / products.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/code/:code', async (req, res) => {
  try {
    const product = await AdminProduct.findOne({ productCode: req.params.code });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching product by code' });
  }
});

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

    const conversionRate = product.conversionRate || 1;
    const overallQuantityToReduce = quantity * conversionRate;

    if (product.overallQuantity < overallQuantityToReduce) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    product.stockQuantity -= quantity;
    product.overallQuantity -= overallQuantityToReduce;
    
    await product.save();
    
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

router.put('/stock/:productCode', async (req, res) => {  // Changed from :id to :productCode
    try {
        const { 
            newStockAdded, 
            previousStock, 
            supplierName, 
            batchNumber, 
            manufactureDate, 
            expiryDate, 
            mrp, 
            sellerPrice 
        } = req.body;

        // Validate required fields
        if (!newStockAdded || isNaN(parseFloat(newStockAdded))) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid stock quantity' 
            });
        }

        // Find product by code first
        const product = await AdminProduct.findOne({ productCode: req.params.productCode });
        
        if (!product) {
            return res.status(404).json({ 
                success: false,
                message: 'Product not found' 
            });
        }

        // Convert to numbers
        const addedStock = parseFloat(newStockAdded);
        const prevStock = parseFloat(previousStock);

        // Update the product
        const updatedProduct = await AdminProduct.findByIdAndUpdate(
            product._id,  // Use the found product's ID
            { 
                $inc: { stockQuantity: addedStock },
                ...(supplierName && { supplierName }),
                ...(batchNumber && { batchNumber }),
                ...(manufactureDate && { manufactureDate: new Date(manufactureDate) }),
                ...(expiryDate && { expiryDate: new Date(expiryDate) }),
                ...(mrp && { mrp: parseFloat(mrp) }),
                ...(sellerPrice && { sellerPrice: parseFloat(sellerPrice) })
            },
            { new: true }
        );

        // Create stock history record
        const stockHistory = new StockHistory({
            productId: product._id,
            previousStock: prevStock,
            addedStock: addedStock,
            newStock: prevStock + addedStock,
            supplierName: supplierName || 'N/A',
            batchNumber: batchNumber || 'N/A',
            manufactureDate: manufactureDate ? new Date(manufactureDate) : null,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            mrp: mrp ? parseFloat(mrp) : 0,
            sellerPrice: sellerPrice ? parseFloat(sellerPrice) : 0,
            updatedBy: req.user?.id || 'system'
        });

        await stockHistory.save();

        res.json({
            success: true,
            message: 'Stock updated successfully',
            product: updatedProduct
        });

    } catch (err) {
        console.error('Error updating stock:', err);
        res.status(500).json({ 
            success: false,
            message: 'Server error while updating stock',
            error: err.message 
        });
    }
});


router.get('/stock-history', async (req, res) => {
    try {
        // Optional query parameters for filtering
        const { productCode, startDate, endDate } = req.query;
        
        let query = {};
        
        if (productCode) {
            query.productCode = productCode;
        }
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        
        const history = await StockHistory.find(query)
            .sort({ createdAt: -1 }) // Sort by most recent first
            .lean(); // Convert to plain JS objects
        
        res.json(history);
    } catch (err) {
        console.error('Error fetching stock history:', err);
        res.status(500).json({ error: 'Server error while fetching stock history' });
    }
});

// Get seller expenses grouped by supplier and batch
router.get('/seller-expenses', async (req, res) => {
    try {
        const { startDate, endDate, supplierName } = req.query;
        
        const matchStage = {
            supplierName: { $exists: true, $ne: '' },
            batchNumber: { $exists: true, $ne: '' }
        };
        
        // Add date filtering if provided
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
        }
        
        // Add supplier filtering if provided
        if (supplierName) {
            matchStage.supplierName = new RegExp(supplierName, 'i');
        }
        
        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        supplierName: "$supplierName",
                        batchNumber: "$batchNumber",
                        gstCategory: "$gstCategory"
                    },
                    products: {
                        $push: {
                            _id: "$_id",
                            productName: "$productName",
                            productCode: "$productCode",
                            category: "$category",
                            baseUnit: "$baseUnit",
                            addedStock: "$stockQuantity",
                            sellerPrice: "$sellerPrice",
                            mrp: "$mrp",
                            manufactureDate: "$manufactureDate",
                            expiryDate: "$expiryDate",
                            createdAt: "$createdAt"
                        }
                    },
                    totalAmount: {
                        $sum: { $multiply: ["$stockQuantity", "$sellerPrice"] }
                    },
                    totalProfit: {
                        $sum: {
                            $multiply: [
                                "$stockQuantity",
                                { $subtract: ["$mrp", "$sellerPrice"] }
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    supplierName: "$_id.supplierName",
                    batchNumber: "$_id.batchNumber",
                    gstCategory: "$_id.gstCategory",
                    products: 1,
                    totalAmount: 1,
                    totalProfit: 1
                }
            },
            { $sort: { supplierName: 1, batchNumber: 1 } }
        ];
        
        const sellerExpenses = await AdminProduct.aggregate(pipeline);
        
        res.json(sellerExpenses);
    } catch (err) {
        console.error('Error fetching seller expenses:', err);
        res.status(500).json({ 
            error: 'Failed to fetch seller expenses',
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});


module.exports = router;