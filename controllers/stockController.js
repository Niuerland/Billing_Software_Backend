const AdminProduct = require('../models/AdminProduct'); // model using adminProductSchema
const Bill = require('../models/Bill'); // model using bills with items array

exports.getStockSummary = async (req, res) => {
  try {
    const adminProducts = await AdminProduct.find();
    const bills = await Bill.find();

    const summaryMap = {};

    // Step 1: Initialize map with admin stock
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
      bill.items?.forEach(item => {
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

    // Step 3: Calculate remaining
    const result = Object.values(summaryMap).map(item => ({
      ...item,
      remaining: item.totalUploaded - item.totalSold
    }));

    res.json(result);
  } catch (err) {
    console.error('Stock summary error:', err);
    res.status(500).json({ error: 'Failed to fetch stock summary' });
  }
};
