const AdminProduct = require('../models/AdminProduct');
const Bill = require('../models/Bill');
const StockQuantity = require('../models/StockQuantity');

exports.getStockSummary = async (req, res) => {
  try {
    // First, sync lowStockAlert values from AdminProduct to StockQuantity
    await syncLowStockAlerts();

    // Then proceed with your existing summary logic
    const adminProducts = await AdminProduct.find().lean();
    const bills = await Bill.find().lean();
    const stockQuantities = await StockQuantity.find().lean();

    // Create a map of stock quantities for quick lookup
    const stockQuantityMap = stockQuantities.reduce((acc, sq) => {
      acc[sq.productCode] = sq;
      return acc;
    }, {});

    const summaryMap = {};

    // Step 1: Map all products with their initial stock quantities
    adminProducts.forEach(prod => {
      const stockQty = stockQuantityMap[prod.productCode] || {};
      
      summaryMap[prod.productCode] = {
        productCode: prod.productCode,
        productName: prod.productName,
        category: prod.category,
        baseUnit: prod.baseUnit,
        secondaryUnit: prod.secondaryUnit,
        conversionRate: prod.conversionRate || 1,
        initialStock: prod.stockQuantity || 0,
        currentStock: stockQty.availableQuantity !== undefined 
          ? stockQty.availableQuantity 
          : prod.stockQuantity || 0,
        totalSold: 0,
        lowStockAlert: stockQty.lowStockAlert || 0, // Get from StockQuantity
        isLowStock: false, // Will be calculated later
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
            const stockQty = stockQuantityMap[key] || {};
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
              lowStockAlert: stockQty.lowStockAlert || 0,
              isLowStock: false,
              lastUploaded: new Date()
            };
          }
          
          let soldInBaseUnits;
          if (item.unit === product.baseUnit) {
            soldInBaseUnits = item.quantity;
          } else if (item.unit === product.secondaryUnit) {
            soldInBaseUnits = item.quantity / (product.conversionRate || 1);
          } else {
            soldInBaseUnits = item.quantity;
          }
          
          summaryMap[key].totalSold += soldInBaseUnits;
          summaryMap[key].currentStock -= soldInBaseUnits;
        }
      });
    });

    // Step 3: Prepare final result with both base and display units
    const result = Object.values(summaryMap).map(item => {
      const isLowStock = item.currentStock <= item.lowStockAlert;
      
      return {
        productCode: item.productCode,
        productName: item.productName,
        category: item.category,
        baseUnit: item.baseUnit,
        secondaryUnit: item.secondaryUnit,
        conversionRate: item.conversionRate,
        initialStock: item.initialStock,
        initialStockSecondary: item.initialStock * item.conversionRate,
        currentStock: item.currentStock,
        currentStockSecondary: item.currentStock * item.conversionRate,
        totalSold: item.totalSold,
        totalSoldSecondary: item.totalSold * item.conversionRate,
        lowStockAlert: item.lowStockAlert,
        isLowStock,
        lastUploaded: item.lastUploaded
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Stock summary error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch stock summary',
      details: err.message 
    });
  }
};

// Helper function to sync lowStockAlert values
async function syncLowStockAlerts() {
  try {
    const products = await AdminProduct.find({ lowStockAlert: { $gt: 0 } });
    const bulkOps = products.map(product => ({
      updateOne: {
        filter: { productCode: product.productCode },
        update: { 
          $set: { 
            lowStockAlert: product.lowStockAlert,
            isLowStock: product.stockQuantity <= product.lowStockAlert 
          } 
        },
        upsert: true
      }
    }));
    
    if (bulkOps.length > 0) {
      await StockQuantity.bulkWrite(bulkOps);
    }
  } catch (err) {
    console.error('Error syncing low stock alerts:', err);
  }
}