// routes/bills.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const StockQuantity = require('../models/StockQuantity');
const AdminProduct = require('../models/AdminProduct');
const Customer = require('../models/Customer');

router.get('/', async (req, res) => {
    try {
        const { customerId, unpaidOnly } = req.query;

        // Validate customerId if provided
        if (customerId && isNaN(parseInt(customerId))) {
            return res.status(400).json({ message: 'Customer ID must be a number' });
        }

        // If customerId is provided with unpaidOnly=true
        if (customerId && unpaidOnly === 'true') {
            const unpaidBills = await Bill.find({
                'customer.id': parseInt(customerId),
                unpaidAmountForThisBill: { $gt: 0 }
            }).sort({ createdAt: 1 }).lean();

            // Ensure all bills have required fields
            const validatedBills = unpaidBills.map(bill => ({
                ...bill,
                customer: {
                    id: bill.customer?.id || 0,
                    name: bill.customer?.name || 'Unknown',
                    contact: bill.customer?.contact || 'Not provided'
                },
                products: bill.products?.map(p => ({
                    name: p.name || 'Unnamed product',
                    price: p.price || 0,
                    quantity: p.quantity || 0
                })) || [],
                total: bill.total || 0,
                unpaidAmountForThisBill: bill.unpaidAmountForThisBill || 0
            }));

            return res.status(200).json(validatedBills);
        }

        // If no specific query parameters, return all bills
        const bills = await Bill.find().lean();
        res.status(200).json(bills);
    } catch (err) {
        console.error('Error fetching bills:', err);
        res.status(500).json({ message: 'Failed to fetch bills', error: err.message });
    }
});

// Keep the separate unpaid endpoint for backward compatibility
router.get('/unpaid', async (req, res) => {
    try {
        const { customerId } = req.query;
        if (!customerId) {
            return res.status(400).json({ message: 'Customer ID is required' });
        }

        // Find bills for the customer where 'unpaidAmountForThisBill' is greater than 0
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


router.post('/settle-outstanding', async (req, res) => {
    try {
        const {
            customerId, // Needed to update customer's total outstanding credit
            paymentMethod,
            transactionId,
            amountPaid,
            cashier, // Total amount paid for outstanding bills in this transaction
            selectedUnpaidBillIds // Array of bill _ids to be updated
        } = req.body;

        if (!cashier || !cashier.cashierId || !cashier.cashierName || !cashier.counterNum) {
            return res.status(400).json({ message: 'Cashier details are required.' });
        }
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

            bill.cashier = {
                cashierId: cashier.cashierId,
                cashierName: cashier.cashierName,
                counterNum: cashier.counterNum,
                contactNumber: cashier.contactNumber
            };
            
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

router.post('/', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const billData = req.body;
        const {
            customer,
            products = [],
            payment,
            cashier,
            billNumber,
            previousOutstandingCredit,
            selectedUnpaidBillIds = [],
            transportCharge = 0,
            productSubtotal,
            totalGst,
            totalSgst,
            productTotalWithTax
        } = billData;

        // Validate required fields
        if (!cashier || !cashier.cashierId || !cashier.cashierName || !cashier.counterNum) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Cashier details are required.' });
        }

        if (!customer || typeof customer.id === 'undefined') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Customer information is required' });
        }

        const isOutstandingOnly = products.length === 0 && (payment?.selectedOutstandingPayment > 0);
        if (!isOutstandingOnly && products.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'At least one product is required for regular bills' });
        }

        // Calculate totals if not provided
        const calculatedProductSubtotal = productSubtotal || 
            products.reduce((sum, item) => sum + (item.basicPrice * item.quantity), 0);
        const calculatedTotalGst = totalGst || 
            products.reduce((sum, item) => sum + (item.gstAmount * item.quantity), 0);
        const calculatedTotalSgst = totalSgst || 
            products.reduce((sum, item) => sum + (item.sgstAmount * item.quantity), 0);
        const calculatedProductTotalWithTax = productTotalWithTax || 
            (calculatedProductSubtotal + calculatedTotalGst + calculatedTotalSgst);

        const grandTotal = calculatedProductTotalWithTax + (parseFloat(transportCharge) || 0)
                         + (payment?.selectedOutstandingPayment || 0);
        const paymentAmount = (parseFloat(payment?.currentBillPayment) || 0) +
                              (parseFloat(payment?.selectedOutstandingPayment) || 0);

        const unpaidAmount = Math.max(0, grandTotal - paymentAmount);
        const status = unpaidAmount > 0 ? (paymentAmount > 0 ? 'partial' : 'unpaid') : 'paid';

        let savedBill = null;
        if (!isOutstandingOnly) {
            const newBill = new Bill({
                customer,
                cashier,
                products,
                transportCharge,
                productSubtotal: calculatedProductSubtotal,
                totalGst: calculatedTotalGst,
                totalSgst: calculatedTotalSgst,
                productTotalWithTax: calculatedProductTotalWithTax,
                currentBillTotal: calculatedProductTotalWithTax + (parseFloat(transportCharge) || 0),
                previousOutstandingCredit,
                grandTotal,
                paidAmount: paymentAmount,
                unpaidAmountForThisBill: unpaidAmount,
                status,
                billNumber: billNumber || `BILL-${Date.now()}`,
                payment: {
                    method: payment?.method || 'cash',
                    currentBillPayment: payment?.currentBillPayment || 0,
                    selectedOutstandingPayment: payment?.selectedOutstandingPayment || 0,
                    transactionId: payment?.transactionId || ''
                }
            });

            savedBill = await newBill.save({ session });

            // Update stock quantities
            for (const item of products) {
                const product = await AdminProduct.findOne({
                    $or: [
                        { productName: item.name },
                        { productCode: item.code }
                    ]
                }).session(session);

                if (!product) continue;

                const stock = await StockQuantity.findOne({ productCode: item.code }).session(session);
                if (!stock) continue;

                const conversionRate = product.conversionRate || 1;
                const qtyInBase = item.unit === product.baseUnit
                    ? item.quantity
                    : item.quantity / conversionRate;

                stock.availableQuantity -= qtyInBase;
                await stock.save({ session });
            }
        }

        // Settle outstanding bills if applicable
        if (selectedUnpaidBillIds.length > 0 && payment?.selectedOutstandingPayment > 0) {
            await settleOutstandingBills(
                customer.id,
                payment.method,
                payment.transactionId,
                payment.selectedOutstandingPayment,
                selectedUnpaidBillIds,
                session
            );
        }

        // Update customer's total outstanding credit
        const customerRecord = await Customer.findOne({ id: customer.id }).session(session);
        if (customerRecord) {
            const result = await Bill.aggregate([
                { $match: { 'customer.id': parseInt(customer.id), unpaidAmountForThisBill: { $gt: 0 } } },
                { $group: { _id: null, totalUnpaid: { $sum: '$unpaidAmountForThisBill' } } }
            ]).session(session);
            customerRecord.outstandingCredit = result[0]?.totalUnpaid || 0;
            await customerRecord.save({ session });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: isOutstandingOnly ? 'Outstanding payments processed successfully' : 'Bill created successfully',
            bill: savedBill
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error creating bill:', error);

        if (error.code === 11000 && error.keyPattern?.billNumber) {
            return res.status(409).json({ success: false, message: 'Bill number already exists' });
        }

        res.status(500).json({ success: false, message: 'Failed to process payment', error: error.message });
    }
});


async function settleOutstandingBills(customerId, paymentMethod, transactionId, amount, billIds, session) {
    let remainingAmount = amount;
    const bills = await Bill.find({
        _id: { $in: billIds },
        unpaidAmountForThisBill: { $gt: 0 }
    }).session(session).sort({ date: 1 });

    for (const bill of bills) {
        if (remainingAmount <= 0) break;
        
        const paymentApplied = Math.min(remainingAmount, bill.unpaidAmountForThisBill);
        bill.paidAmount += paymentApplied;
        bill.unpaidAmountForThisBill -= paymentApplied;
        bill.status = bill.unpaidAmountForThisBill > 0 ? 'partial' : 'paid';
        bill.paymentMethod = paymentMethod;
        if (transactionId) bill.transactionId = transactionId;
        
        await bill.save({ session });
        remainingAmount -= paymentApplied;
    }
}

module.exports = router;
