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

        // Find bills for the customer where 'unpaidAmountForThisBill' is greater than 0
        // This ensures only truly outstanding bills are returned.
        const unpaidBills = await Bill.find({
            'customer.id': parseInt(customerId),
            unpaidAmountForThisBill: { $gt: 0 }
        }).sort({ createdAt: 1 }); // Sort by creation date to get oldest first

        res.status(200).json(unpaidBills);
    } catch (err) {
        console.error('Error fetching unpaid bills:', err);
        res.status(500).json({ message: 'Failed to fetch unpaid bills' });
    }
});

// --- NEW DEDICATED ENDPOINT FOR SETTLING OUTSTANDING BILLS ---
// This endpoint is used when a customer makes a payment specifically towards their
// existing outstanding bills, independent of a new purchase.
router.post('/settle-outstanding', async (req, res) => {
    try {
        const {
            customerId, // Needed to update customer's total outstanding credit
            paymentMethod,
            transactionId,
            amountPaid, // Total amount paid for outstanding bills in this transaction
            selectedUnpaidBillIds // Array of bill _ids to be updated
        } = req.body;

        // Validate required input fields
        if (!customerId || !paymentMethod || typeof amountPaid === 'undefined' || !Array.isArray(selectedUnpaidBillIds) || selectedUnpaidBillIds.length === 0) {
            return res.status(400).json({ message: 'Missing required payment details or selected bills.' });
        }

        let remainingPaymentToDistribute = amountPaid; // Amount left to apply to bills
        const updatedBills = []; // To store the bills that were successfully updated

        // Fetch selected bills that are still outstanding, sorted by date to prioritize older debts
        const billsToUpdate = await Bill.find({
            _id: { $in: selectedUnpaidBillIds },
            unpaidAmountForThisBill: { $gt: 0 } // Ensure they are genuinely unpaid
        }).sort({ date: 1 });

        if (billsToUpdate.length === 0) {
            return res.status(404).json({ message: 'No valid outstanding bills found for settlement.' });
        }

        // Iterate through the selected bills and apply the payment
        for (const bill of billsToUpdate) {
            if (remainingPaymentToDistribute <= 0) break; // Stop if no more payment to distribute

            const unpaidAmount = bill.unpaidAmountForThisBill; // Current unpaid amount for THIS specific bill

            if (remainingPaymentToDistribute >= unpaidAmount) {
                // If the remaining payment covers this bill's unpaid amount, fully pay it off
                bill.paidAmount += unpaidAmount; // Add the full unpaid amount to the bill's paid total
                bill.unpaidAmountForThisBill = 0; // Set unpaid amount for THIS bill to zero
                bill.status = 'paid'; // Mark THIS bill as fully paid
                remainingPaymentToDistribute -= unpaidAmount; // Reduce the payment amount remaining
            } else {
                // If the remaining payment is less than this bill's unpaid amount, partially pay it
                bill.paidAmount += remainingPaymentToDistribute; // Add the remaining payment to the bill's paid total
                bill.unpaidAmountForThisBill -= remainingPaymentToDistribute; // Reduce unpaid amount for THIS bill
                bill.status = 'partial'; // Mark THIS bill as partially paid
                remainingPaymentToDistribute = 0; // All payment distributed
            }

            bill.paymentMethod = paymentMethod; // Update payment method for this specific payment
            if (transactionId) {
                bill.transactionId = transactionId; // Update transaction ID
            }
            updatedBills.push(await bill.save()); // Save the updated bill document
        }

        // Update customer's total outstanding credit after these payments
        const customerRecord = await Customer.findOne({ id: customerId });
        if (customerRecord) {
            // Recalculate customer's total outstanding by summing 'unpaidAmountForThisBill'
            // across all their bills that still have an outstanding balance.
            const remainingOutstanding = await Bill.aggregate([
                { $match: { 'customer.id': parseInt(customerId), unpaidAmountForThisBill: { $gt: 0 } } },
                { $group: { _id: null, totalUnpaid: { $sum: '$unpaidAmountForThisBill' } } }
            ]);

            customerRecord.outstandingCredit = remainingOutstanding.length > 0 ? remainingOutstanding[0].totalUnpaid : 0;
            await customerRecord.save(); // Save the updated customer record
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
            // currentBillTotal, // This field is now redundant as grandTotal is derived
            previousOutstandingCredit, // This is just for informational purposes or customer display
            payment,
            billNumber,
            selectedUnpaidBillIds = []
        } = billData;

        // Calculate the grandTotal for the CURRENT new bill based ONLY on its products and GST.
        // This ensures 'grandTotal' strictly represents the value of the current purchase.
        const grandTotalForCurrentBill = (productSubtotal || 0) + (productGst || 0);

        if (!customer || typeof customer.id === 'undefined' || !payment || typeof payment.amountPaid === 'undefined') {
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

        // --- Process current new bill payment ---
        // 'payment.currentBillPayment' is the amount specifically paid towards THIS new bill.
        let newBillCalculatedUnpaid = grandTotalForCurrentBill - payment.currentBillPayment;
        if (newBillCalculatedUnpaid < 0) newBillCalculatedUnpaid = 0;

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
            currentBillTotal: grandTotalForCurrentBill, // Use the calculated grandTotal for currentBillTotal
            previousOutstandingCredit, // This remains as informational, not part of current bill's grandTotal
            grandTotal: grandTotalForCurrentBill, // Store the calculated grandTotal for THIS bill
            paidAmount: payment.currentBillPayment,
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

                if (stock && product) {
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
            }).sort({ date: 1 });

            for (const bill of billsToSettle) {
                if (outstandingPaymentRemaining <= 0) break;

                const unpaid = bill.unpaidAmountForThisBill;

                if (outstandingPaymentRemaining >= unpaid) {
                    bill.paidAmount += unpaid;
                    bill.unpaidAmountForThisBill = 0;
                    bill.status = 'paid';
                    outstandingPaymentRemaining -= unpaid;
                } else {
                    bill.paidAmount += outstandingPaymentRemaining;
                    bill.unpaidAmountForThisBill -= outstandingPaymentRemaining;
                    bill.status = 'partial';
                    outstandingPaymentRemaining = 0;
                }
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
