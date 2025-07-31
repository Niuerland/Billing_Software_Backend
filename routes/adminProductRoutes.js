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

// Add this new route to your existing product routes file
router.get('/name/:name', async (req, res) => {
  try {
    // Case-insensitive search for product name
    const product = await AdminProduct.findOne({ 
      productName: { $regex: new RegExp(req.params.name, 'i') } 
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (err) {
    res.status(500).json({ 
      error: 'Error fetching product by name',
      details: err.message 
    });
  }
});

// Add this search endpoint that searches by both code and name
router.get('/search', async (req, res) => {
  try {
    const query = req.query.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const products = await AdminProduct.find({
      $or: [
        { productCode: { $regex: query, $options: 'i' } },
        { productName: { $regex: query, $options: 'i' } }
      ]
    }).limit(10); // Limit to 10 results
    
    res.json(products);
  } catch (err) {
    res.status(500).json({ 
      error: 'Error searching products',
      details: err.message 
    });
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

// Add this new route for stock availability check
router.get('/check-stock/:productCode', async (req, res) => {
  try {
    const { unit, quantity } = req.query;
    const product = await AdminProduct.findOne({ productCode: req.params.productCode });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stock = await StockQuantity.findOne({ productCode: req.params.productCode });
    if (!stock) {
      return res.json({ 
        available: 0, 
        required: 0, 
        isAvailable: false,
        availableDisplay: 0
      });
    }

    // Convert everything to base units for comparison
    const availableInBaseUnits = stock.availableQuantity;
    let requiredInBaseUnits = 0;

    if (unit === product.baseUnit) {
      // If requesting in base unit, no conversion needed
      requiredInBaseUnits = quantity;
    } else if (unit === product.secondaryUnit) {
      // If requesting in secondary unit, convert using conversion rate
      requiredInBaseUnits = quantity * (product.conversionRate || 1);
    } else {
      // Handle other units (ml, gram, etc.)
      if (unit === 'gram' && product.baseUnit === 'kg') {
        requiredInBaseUnits = quantity / 1000;
      } else if (unit === 'ml' && product.baseUnit === 'liter') {
        requiredInBaseUnits = quantity / 1000;
      } else {
        // If no conversion is defined, assume 1:1
        requiredInBaseUnits = quantity;
      }
    }

    const isAvailable = availableInBaseUnits >= requiredInBaseUnits;

    // Calculate display value (how much is available in the requested unit)
    let availableDisplay = availableInBaseUnits;
    
    if (unit === product.secondaryUnit) {
      availableDisplay = availableInBaseUnits * (product.conversionRate || 1);
    } else if (unit === 'gram' && product.baseUnit === 'kg') {
      availableDisplay = availableInBaseUnits * 1000;
    } else if (unit === 'ml' && product.baseUnit === 'liter') {
      availableDisplay = availableInBaseUnits * 1000;
    }

    res.json({
      available: availableInBaseUnits,
      required: requiredInBaseUnits,
      isAvailable,
      availableDisplay,
      baseUnit: product.baseUnit,
      requestedUnit: unit
    });
  } catch (err) {
    res.status(500).json({ error: 'Error checking stock', details: err.message });
  }
});

// Update the stock update endpoint
router.put('/stock/:productCode', async (req, res) => {
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

    if (!newStockAdded || isNaN(parseFloat(newStockAdded))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid stock quantity' 
      });
    }

    const product = await AdminProduct.findOne({ productCode: req.params.productCode });
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    const addedStock = parseFloat(newStockAdded);
    const prevStock = parseFloat(previousStock);

    // Update product stock
    const updatedProduct = await AdminProduct.findByIdAndUpdate(
      product._id,
      { 
        $inc: { stockQuantity: addedStock, overallQuantity: addedStock * (product.conversionRate || 1) },
        ...(supplierName && { supplierName }),
        ...(batchNumber && { batchNumber }),
        ...(manufactureDate && { manufactureDate: new Date(manufactureDate) }),
        ...(expiryDate && { expiryDate: new Date(expiryDate) }),
        ...(mrp && { mrp: parseFloat(mrp) }),
        ...(sellerPrice && { sellerPrice: parseFloat(sellerPrice) })
      },
      { new: true }
    );

    // Update stock quantity
    const stock = await StockQuantity.findOne({ productCode: req.params.productCode });
    if (stock) {
      stock.totalQuantity += addedStock ;
      stock.availableQuantity += addedStock;
      await stock.save();
    } else {
      const newStock = new StockQuantity({
        productCode: product.productCode,
        productName: product.productName,
        totalQuantity: addedStock,
        availableQuantity: addedStock,
        sellingQuantity: 0
      });
      await newStock.save();
    }

    // Create stock history
    const stockHistory = new StockHistory({
      productId: product._id,
      productCode: product.productCode,
      productName: product.productName,
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
      product: updatedProduct,
      stock: stock || newStock
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

router.get('/stock/:productCode', async (req, res) => {
  try {
    const productCode = req.params.productCode;

    // Get product details
    const product = await AdminProduct.findOne({ productCode });
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    // Get stock quantity
    const stock = await StockQuantity.findOne({ productCode });
    
    // Get stock history (optional - you might want to limit/paginate this)
    const stockHistory = await StockHistory.find({ productCode })
      .sort({ createdAt: -1 }) // newest first
      .limit(50); // limit to 50 most recent entries

    res.json({
      success: true,
      product,
      stock: stock || {
        productCode: product.productCode,
        productName: product.productName,
        totalQuantity: 0,
        availableQuantity: 0,
        sellingQuantity: 0
      },
      stockHistory
    });

  } catch (err) {
    console.error('Error fetching stock data:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error while fetching stock data',
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
                        batchNumber: "$batchNumber"
                        // Removed gstCategory from grouping
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
                    // Removed gstCategory from projection as well
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

// Add this to your productRoutes.js
router.get('/seller-info', async (req, res) => {
  try {
    const { supplierName, brand } = req.query;
    
    if (!supplierName || !brand) {
      return res.status(400).json({ error: 'Supplier name and brand are required' });
    }

    const product = await AdminProduct.findOne({ 
      supplierName: new RegExp(supplierName, 'i'),
      brand: new RegExp(brand, 'i')
    }).select('supplierName brand _id').lean();

    if (!product) {
      return res.status(404).json({ error: 'No products found for this supplier and brand' });
    }

    res.json({
      sellerId: product._id,
      supplierName: product.supplierName,
      brand: product.brand
    });
  } catch (err) {
    console.error('Error fetching seller info:', err);
    res.status(500).json({ 
      error: 'Failed to fetch seller info',
      details: err.message
    });
  }
});


router.delete('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    
    // First find the product to get its code
    const product = await AdminProduct.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete the product
    await AdminProduct.findByIdAndDelete(productId);
    
    // Also delete the corresponding stock quantity record
    await StockQuantity.findOneAndDelete({ productCode: product.productCode });
    
    // Add a record to stock history for audit purposes
    const stockHistory = new StockHistory({
      productId: product._id,
      productCode: product.productCode,
      productName: product.productName,
      action: 'DELETE',
      previousStock: product.stockQuantity,
      addedStock: 0,
      newStock: 0,
      updatedBy: req.user?.id || 'system',
      notes: 'Product deleted from system'
    });
    await stockHistory.save();

    res.json({ 
      success: true,
      message: 'Product and associated stock records deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ 
      error: 'Failed to delete product',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

module.exports = router;