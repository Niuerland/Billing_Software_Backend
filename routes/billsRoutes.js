// routes/bills.js
const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const StockQuantity = require('../models/StockQuantity');
const AdminProduct = require('../models/AdminProduct');
const Customer = require('../models/Customer');

// Get unpaid bills for a customer (filtered to exclude already settled ones)
router.get('/unpaid', async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({ message: 'Customer ID is required' });
    }

    const unpaidBills = await Bill.find({
  'customer.id': parseInt(customerId),
  unpaidAmountForThisBill: { $gt: 0 }
}).sort({ createdAt: 1 });




    res.status(200).json(unpaidBills);
  } catch (err) {
    console.error('Error fetching unpaid bills:', err);
    res.status(500).json({ message: 'Failed to fetch unpaid bills' });
  }
});

// Create new bill with settlement of old unpaid bills
router.post('/', async (req, res) => {
  try {
    const billData = req.body;
    const {
      customer,
      products,
      productSubtotal,
      productGst,
      currentBillTotal,
      previousOutstandingCredit,
      grandTotal,
      payment,
      billNumber,
      selectedUnpaidBills = []
    } = billData;

    if (!customer || typeof customer.id === 'undefined' || typeof grandTotal === 'undefined' || !payment || typeof payment.amountPaid === 'undefined') {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    if (!billNumber) {
      return res.status(400).json({ message: 'Bill number is required' });
    }

    // Stock availability check
    if (products && products.length > 0) {
      for (const item of products) {
        const product = await AdminProduct.findOne({ productName: item.name });
        if (!product) {
          return res.status(400).json({ message: `Product ${item.name} not found.` });
        }

        const stock = await StockQuantity.findOne({ productCode: product.productCode });
        const availableInBaseUnits = stock?.availableQuantity || 0;

        let requestedInBaseUnits;
        if (item.unit === product.baseUnit) {
          requestedInBaseUnits = item.quantity;
        } else if (item.unit === product.secondaryUnit) {
          requestedInBaseUnits = item.quantity / (product.conversionRate || 1);
        } else {
          requestedInBaseUnits = item.quantity;
        }

        if (requestedInBaseUnits > availableInBaseUnits) {
          const availableDisplay = availableInBaseUnits * (item.unit === product.secondaryUnit ? (product.conversionRate || 1) : 1);
          return res.status(400).json({
            message: `Only ${availableDisplay.toFixed(2)} ${item.unit} available for ${item.name}.`,
            productName: item.name
          });
        }
      }
    }

    // Settle previous unpaid bills using overpaid amount
    let amountRemaining = payment.amountPaid - grandTotal;

    await Promise.all(
      selectedUnpaidBills.map(async (billId) => {
        const bill = await Bill.findById(billId);
        if (bill && bill.unpaidAmountForThisBill > 0) {
          const unpaid = bill.unpaidAmountForThisBill;

          if (amountRemaining >= unpaid) {
            bill.paidAmount += unpaid;
            bill.unpaidAmountForThisBill = 0;
            bill.status = 'paid';
            bill.creditPaid = true;
            amountRemaining -= unpaid;
          } else {
            bill.paidAmount += amountRemaining;
            bill.unpaidAmountForThisBill -= amountRemaining;
            bill.status = 'partial';
            amountRemaining = 0;
          }

          await bill.save();
        }
      })
    );

    let calculatedUnpaid = grandTotal - payment.amountPaid;
    if (calculatedUnpaid < 0) calculatedUnpaid = 0;

    let billStatus = calculatedUnpaid > 0 ? (payment.amountPaid > 0 ? 'partial' : 'unpaid') : 'paid';

    const newBill = new Bill({
      customer: {
        id: customer.id,
        name: customer.name,
        contact: customer.contact,
        aadhaar: customer.aadhaar,
        location: customer.location
      },
      products,
      productSubtotal,
      productGst,
      currentBillTotal,
      previousOutstandingCredit,
      grandTotal,
      paidAmount: payment.amountPaid,
      unpaidAmountForThisBill: calculatedUnpaid,
      status: billStatus,
      billNumber,
      paymentMethod: payment.method,
      transactionId: payment.transactionId
    });

    await newBill.save();

    // Update stock
    if (products && products.length > 0 && billStatus !== 'unpaid') {
      for (const item of products) {
        const product = await AdminProduct.findOne({ productName: item.name });
        const stock = await StockQuantity.findOne({ productCode: product.productCode });

        if (stock) {
          const conversionRate = product.conversionRate || 1;
          const qtyInBase = item.unit === product.baseUnit
            ? item.quantity
            : item.quantity / conversionRate;

          stock.availableQuantity -= qtyInBase;
          stock.sellingQuantity += qtyInBase;
          await stock.save();
        }
      }
    }

    // Update customer outstanding credit
    const customerRecord = await Customer.findOne({ id: customer.id });
    if (customerRecord) {
      let newOutstanding = grandTotal - payment.amountPaid;
      if (newOutstanding < 0) newOutstanding = 0;

      customerRecord.outstandingCredit = newOutstanding;
      await customerRecord.save();
    }

    res.status(201).json({
      message: 'Bill created and unpaid bills settled.',
      bill: newBill
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.billNumber) {
      return res.status(409).json({ message: 'Bill number already exists.' });
    }
    console.error('Error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

module.exports = router;