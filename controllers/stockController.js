const AdminProduct = require('../models/AdminProduct');
const Bill = require('../models/Bill');
const StockQuantity = require('../models/StockQuantity');

exports.getStockSummary = async (req, res) => {
  try {
    const adminProducts = await AdminProduct.find().lean();
    const bills = await Bill.find().lean();
    const stockQuantities = await StockQuantity.find().lean();

    const summaryMap = {};

    // Step 1: Map all products with their initial stock quantities
    adminProducts.forEach(prod => {
      summaryMap[prod.productCode] = {
        productCode: prod.productCode,
        productName: prod.productName,
        category: prod.category,
        baseUnit: prod.baseUnit,
        secondaryUnit: prod.secondaryUnit,
        conversionRate: prod.conversionRate || 1,
        initialStock: prod.stockQuantity || 0, // In base units
        currentStock: prod.stockQuantity || 0, // Will be reduced by sales
        totalSold: 0, // In base units
        lastUploaded: prod.updatedAt
      };
    });

    // Step 2: Calculate sold quantities from bills with unit conversion
    bills.forEach(bill => {
      bill.products?.forEach(item => {
        const product = adminProducts.find(p => p.productName === item.name);
        if (product) {
          const key = product.productCode;
          if (!summaryMap[key]) {
            summaryMap[key] = {
              productCode: key,
              productName: item.name,
              category: product.category,
              baseUnit: product.baseUnit,
              secondaryUnit: product.secondaryUnit,
              conversionRate: product.conversionRate || 1,
              initialStock: 0,
              currentStock: 0,
              totalSold: 0,
              lastUploaded: new Date()
            };
          }
          
          // Convert sold quantity to base units based on the unit used in the bill
          let soldInBaseUnits;
          if (item.unit === product.baseUnit) {
            soldInBaseUnits = item.quantity;
          } else if (item.unit === product.secondaryUnit) {
            soldInBaseUnits = item.quantity / (product.conversionRate || 1);
          } else {
            soldInBaseUnits = item.quantity; // Default to base units
          }
          
          summaryMap[key].totalSold += soldInBaseUnits;
          summaryMap[key].currentStock -= soldInBaseUnits;
        }
      });
    });

    // Step 3: Prepare final result with both base and display units
    const result = Object.values(summaryMap).map(item => ({
      productCode: item.productCode,
      productName: item.productName,
      category: item.category,
      baseUnit: item.baseUnit,
      secondaryUnit: item.secondaryUnit,
      conversionRate: item.conversionRate,
      initialStock: item.initialStock, // In base units
      initialStockSecondary: item.initialStock * item.conversionRate, // In secondary units
      currentStock: item.currentStock, // In base units
      currentStockSecondary: item.currentStock * item.conversionRate, // In secondary units
      totalSold: item.totalSold, // In base units
      totalSoldSecondary: item.totalSold * item.conversionRate, // In secondary units
      lastUploaded: item.lastUploaded
    }));

    res.json(result);
  } catch (err) {
    console.error('Stock summary error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch stock summary',
      details: err.message 
    });
  }
};