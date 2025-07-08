const AdminProduct = require('../models/AdminProduct');
const Bill = require('../models/Bill');

exports.getStockSummary = async (req, res) => {
  try {
    const adminProducts = await AdminProduct.find();
    const bills = await Bill.find();

    const summaryMap = {};

    // Step 1: Map uploaded stock from admin products
    adminProducts.forEach(prod => {
      summaryMap[prod.productName] = {
        productName: prod.productName,
        category: prod.category,
        totalUploaded: prod.stockQuantity || 0,
        totalSold: 0
      };
    });

    // Step 2: Add sold quantity from bills
    bills.forEach(bill => {
      bill.products?.forEach(item => {
        const key = item.name;
        if (!summaryMap[key]) {
          summaryMap[key] = {
            productName: key,
            category: 'Unknown',
            totalUploaded: 0,
            totalSold: 0
          };
        }
        summaryMap[key].totalSold += item.quantity;
      });
    });

    // Step 3: Calculate remaining, clamp at 0
    const result = Object.values(summaryMap).map(item => ({
      ...item,
      remaining: Math.max(item.totalUploaded - item.totalSold, 0)
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