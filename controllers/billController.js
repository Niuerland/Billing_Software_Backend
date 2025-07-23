const Bill = require('../models/Bill');
const AdminProduct = require('../models/AdminProduct');
const StockQuantity = require('../models/StockQuantity');

const createBill = async (req, res) => {
  try {
    const {
      customer,
      products,
      productSubtotal,
      productGst,
      currentBillTotal,
      previousOutstandingCredit,
      grandTotal,
      paidAmount,
      unpaidAmountForThisBill,
      status,
      billNumber,
      paymentMethod
    } = req.body;

    // 1. Save the new bill
    const newBill = new Bill({
      customer,
      products,
      productSubtotal,
      productGst,
      currentBillTotal,
      previousOutstandingCredit,
      grandTotal,
      paidAmount,
      unpaidAmountForThisBill,
      status,
      billNumber,
      paymentMethod
    });

    await newBill.save();

    // 2. If products exist → update stock
    if (products.length > 0) {
      for (const item of products) {
        const product = await AdminProduct.findOne({ productCode: item.productCode });
        if (!product) continue;

        const stock = await StockQuantity.findOne({ productId: product._id });
        if (stock) {
          stock.soldQuantity += item.totalConvertedQty;
          stock.availableQuantity -= item.totalConvertedQty;
          await stock.save();
        }
      }
    }

    // 3. If this is a payment-only bill (no products), apply to previous dues
// 3. If this is a payment-only bill (no products), apply to previous dues
if (products.length === 0 && previousOutstandingCredit > 0 && paidAmount > 0) {
  let remainingPayment = paidAmount;

  const previousUnpaidBills = await Bill.find({
    'customer.id': customer.id,
    unpaidAmountForThisBill: { $gt: 0 }
  }).sort({ createdAt: 1 });

  for (let oldBill of previousUnpaidBills) {
    if (remainingPayment <= 0) break;

    const unpaid = oldBill.unpaidAmountForThisBill;

    if (remainingPayment >= unpaid) {
      // Full payment
      oldBill.paidAmount += unpaid;
      oldBill.unpaidAmountForThisBill = 0;
      oldBill.status = 'paid';
      oldBill.creditPaid = true; // 🔥 ADD THIS LINE
      remainingPayment -= unpaid;
    } else {
      // Partial payment
      oldBill.paidAmount += remainingPayment;
      oldBill.unpaidAmountForThisBill -= remainingPayment;
      oldBill.status = 'partial';
      // Don't mark as creditPaid if partial
      remainingPayment = 0;
    }

    await oldBill.save();
  }
}


    res.status(201).json({ message: 'Bill saved successfully', bill: newBill });
  } catch (error) {
    console.error('❌ Error in createBill:', error);
    res.status(500).json({ message: 'Server error while saving bill' });
  }
};

module.exports = {
  createBill
};
