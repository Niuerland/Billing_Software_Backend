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

// --- NEW DEDICATED ENDPOINT FOR SETTLING OUTSTANDING BILLS ---
router.post('/settle-outstanding', async (req, res) => {
    try {
        const {
            customerId, // Needed to update customer's total outstanding credit
            paymentMethod,
            transactionId,
            amountPaid, // Total amount paid for outstanding bills
            selectedUnpaidBillIds // Array of bill _ids to be updated
        } = req.body;

        if (!customerId || !paymentMethod || typeof amountPaid === 'undefined' || !Array.isArray(selectedUnpaidBillIds) || selectedUnpaidBillIds.length === 0) {
            return res.status(400).json({ message: 'Missing required payment details or selected bills.' });
        }

        let remainingPaymentToDistribute = amountPaid;
        const updatedBills = [];

        // Fetch selected bills, ensure they are still outstanding
        const billsToUpdate = await Bill.find({
            _id: { $in: selectedUnpaidBillIds },
            unpaidAmountForThisBill: { $gt: 0 }
        }).sort({ date: 1 }); // Sort by date to apply payment to oldest bills first

        if (billsToUpdate.length === 0) {
            return res.status(404).json({ message: 'No valid outstanding bills found for settlement.' });
        }

        for (const bill of billsToUpdate) {
            if (remainingPaymentToDistribute <= 0) break; // No more money to distribute

            const unpaidAmount = bill.unpaidAmountForThisBill;

            if (remainingPaymentToDistribute >= unpaidAmount) {
                // Fully pay off this bill
                bill.paidAmount += unpaidAmount;
                bill.unpaidAmountForThisBill = 0;
                bill.status = 'paid';
                // bill.creditPaid = true; // Optional: if you want to flag these specifically as credit payments
                remainingPaymentToDistribute -= unpaidAmount;
            } else {
                // Partially pay this bill
                bill.paidAmount += remainingPaymentToDistribute;
                bill.unpaidAmountForThisBill -= remainingPaymentToDistribute;
                bill.status = 'partial';
                // bill.creditPaid = false; // Or handle as needed
                remainingPaymentToDistribute = 0; // All payment distributed
            }

            bill.paymentMethod = paymentMethod; // Update payment method for this specific payment
            if (transactionId) {
                bill.transactionId = transactionId; // Update transaction ID
            }
            updatedBills.push(await bill.save()); // Save the updated bill
        }

        // Update customer's outstanding credit based on the *actual* amount paid towards their old bills
        const customerRecord = await Customer.findOne({ id: customerId });
        if (customerRecord) {
            // Recalculate customer's total outstanding after these payments
            const remainingOutstanding = await Bill.aggregate([
                { $match: { 'customer.id': parseInt(customerId), unpaidAmountForThisBill: { $gt: 0 } } },
                { $group: { _id: null, totalUnpaid: { $sum: '$unpaidAmountForThisBill' } } }
            ]);

            customerRecord.outstandingCredit = remainingOutstanding.length > 0 ? remainingOutstanding[0].totalUnpaid : 0;
            await customerRecord.save();
        }

        res.status(200).json({
            message: 'Outstanding bills settled successfully.',
            updatedBills: updatedBills,
            remainingPayment: remainingPaymentToDistribute // Any change if amountPaid was more than selected bills
        });

    } catch (error) {
        console.error('Error settling outstanding bills:', error);
        res.status(500).json({ message: 'Failed to settle outstanding bills.', error: error.message });
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
            grandTotal, // This grandTotal is for the current new bill transaction only
            payment, // This payment contains currentBillPayment and selectedOutstandingPayment
            billNumber, // This is the new bill number
            selectedUnpaidBillIds = [] // IDs of outstanding bills to settle
        } = billData;

        if (!customer || typeof customer.id === 'undefined' || typeof grandTotal === 'undefined' || !payment || typeof payment.amountPaid === 'undefined') {
            return res.status(400).json({ message: 'Required fields missing for new bill creation.' });
        }

        if (!billNumber) {
            return res.status(400).json({ message: 'Bill number is required for new bill.' });
        }

        // --- Stock availability check (only for new products) ---
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
                    requestedInBaseUnits = item.quantity; // Fallback, consider if this case is valid
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

        // --- Process current new bill payment ---
        let newBillCalculatedUnpaid = grandTotal - payment.currentBillPayment; // grandTotal here is for the new bill
        if (newBillCalculatedUnpaid < 0) newBillCalculatedUnpaid = 0; // No negative unpaid

        let newBillStatus = newBillCalculatedUnpaid > 0 ? (payment.currentBillPayment > 0 ? 'partial' : 'unpaid') : 'paid';

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
            currentBillTotal, // This is the total of the items in the current purchase
            previousOutstandingCredit, // This might be used if customer has general credit, or can be removed if specific bills are managed
            grandTotal, // Total for the current bill including taxes etc.
            paidAmount: payment.currentBillPayment, // Only the portion paid for this new bill
            unpaidAmountForThisBill: newBillCalculatedUnpaid,
            status: newBillStatus,
            billNumber,
            paymentMethod: payment.method,
            transactionId: payment.transactionId
        });

        await newBill.save();

        // --- Update stock for new products (if the new bill isn't entirely unpaid) ---
        if (products && products.length > 0 && newBillStatus !== 'unpaid') {
            for (const item of products) {
                const product = await AdminProduct.findOne({ productName: item.name });
                const stock = await StockQuantity.findOne({ productCode: product.productCode });

                if (stock && product) { // Ensure product is found
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

        // --- Settle selected previous unpaid bills using `payment.selectedOutstandingPayment` ---
        let outstandingPaymentRemaining = payment.selectedOutstandingPayment;
        const updatedOutstandingBills = [];

        if (selectedUnpaidBillIds.length > 0 && outstandingPaymentRemaining > 0) {
            const billsToSettle = await Bill.find({
                _id: { $in: selectedUnpaidBillIds },
                unpaidAmountForThisBill: { $gt: 0 }
            }).sort({ date: 1 }); // Important: Settle oldest first

            for (const bill of billsToSettle) {
                if (outstandingPaymentRemaining <= 0) break;

                const unpaid = bill.unpaidAmountForThisBill;

                if (outstandingPaymentRemaining >= unpaid) {
                    bill.paidAmount += unpaid;
                    bill.unpaidAmountForThisBill = 0;
                    bill.status = 'paid';
                    // bill.creditPaid = true; // Flag as paid via credit/settlement
                    outstandingPaymentRemaining -= unpaid;
                } else {
                    bill.paidAmount += outstandingPaymentRemaining;
                    bill.unpaidAmountForThisBill -= outstandingPaymentRemaining;
                    bill.status = 'partial';
                    // bill.creditPaid = false;
                    outstandingPaymentRemaining = 0;
                }
                // Update payment method and transaction ID for the specific payment on this bill
                bill.paymentMethod = payment.method;
                if (payment.transactionId) {
                    bill.transactionId = payment.transactionId;
                }
                updatedOutstandingBills.push(await bill.save());
            }
        }

        // --- Update customer outstanding credit (recalculate total after all payments) ---
        const customerRecord = await Customer.findOne({ id: customer.id });
        if (customerRecord) {
            const totalRemainingOutstanding = await Bill.aggregate([
                { $match: { 'customer.id': parseInt(customer.id), unpaidAmountForThisBill: { $gt: 0 } } },
                { $group: { _id: null, totalUnpaid: { $sum: '$unpaidAmountForThisBill' } } }
            ]);
            customerRecord.outstandingCredit = totalRemainingOutstanding.length > 0 ? totalRemainingOutstanding[0].totalUnpaid : 0;
            await customerRecord.save();
        }

        res.status(201).json({
            message: 'Bill created and selected unpaid bills settled.',
            bill: newBill,
            settledOutstandingBills: updatedOutstandingBills
        });
    } catch (error) {
        if (error.code === 11000 && error.keyPattern?.billNumber) {
            return res.status(409).json({ message: 'Bill number already exists.' });
        }
        console.error('Error in new bill creation/settlement:', error);
        res.status(500).json({ message: 'Server error.', error: error.message });
    }
});

module.exports = router;