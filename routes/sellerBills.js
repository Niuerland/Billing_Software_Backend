const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const SellerBill = require('../models/SellerBill');

// Configure storage for PDF files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const billType = req.body.billType === 'gst' ? 'gst_bills' : 'non_gst_bills';
    const dir = path.join(__dirname, `../../uploads/${billType}`);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `bill-${uniqueSuffix}-${sanitizedFileName}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

router.post('/upload', upload.single('bill'), async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['sellerId', 'supplierName', 'batchNumber', 'billType', 'billNumber', 'billDate', 'amount'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        missingFields
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate sellerId format
    if (!mongoose.Types.ObjectId.isValid(req.body.sellerId)) {
      return res.status(400).json({ error: 'Invalid seller ID format' });
    }

    // Create new bill document
    const newBill = new SellerBill({
      sellerId: new mongoose.Types.ObjectId(req.body.sellerId),
      supplierName: req.body.supplierName,
      batchNumber: req.body.batchNumber,
      billType: req.body.billType,
      billNumber: req.body.billNumber,
      billDate: new Date(req.body.billDate),
      amount: parseFloat(req.body.amount),
      filePath: req.file.path,
      fileName: req.file.originalname,
      downloadCount: 0
    });

    // Save to database
    await newBill.save();

    res.status(201).json({
      message: 'Bill uploaded successfully',
      bill: {
        id: newBill._id,
        billType: newBill.billType,
        billNumber: newBill.billNumber,
        billDate: newBill.billDate,
        amount: newBill.amount,
        fileName: newBill.fileName
      }
    });

  } catch (error) {
    console.error('Error in upload endpoint:', error);
    
    // Delete uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.message
      });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large',
        details: 'Maximum file size is 5MB'
      });
    }

    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all bills for a seller
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const bills = await SellerBill.find({ sellerId: req.params.sellerId })
      .sort({ billDate: -1 });

    res.json(bills.map(bill => ({
      id: bill._id,
      billType: bill.billType,
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      amount: bill.amount,
      fileName: bill.fileName,
      downloadCount: bill.downloadCount,
      lastDownloadedAt: bill.lastDownloadedAt,
      uploadedAt: bill.createdAt
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// Download endpoint
router.get('/download/:billId', async (req, res) => {
  try {
    const bill = await SellerBill.findById(req.params.billId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (!fs.existsSync(bill.filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Set proper headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(bill.fileName)}"`);
    
    // Create read stream and pipe to response
    const fileStream = fs.createReadStream(bill.filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      res.status(500).end();
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download bill' });
  }
});

// Track download endpoint
router.patch('/track-download/:billId', async (req, res) => {
  try {
    const bill = await SellerBill.findByIdAndUpdate(
      req.params.billId,
      { 
        $inc: { downloadCount: 1 }, 
        lastDownloadedAt: new Date() 
      },
      { new: true }
    );
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json({ message: 'Download tracked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track download' });
  }
});

// Get GST bills
router.get('/gst/:sellerId', async (req, res) => {
  try {
    const bills = await SellerBill.find({ 
      sellerId: req.params.sellerId,
      billType: 'gst'
    }).sort({ billDate: -1 });

    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch GST bills' });
  }
});

// Get non-GST bills
router.get('/non-gst/:sellerId', async (req, res) => {
  try {
    const bills = await SellerBill.find({ 
      sellerId: req.params.sellerId,
      billType: 'non-gst'
    }).sort({ billDate: -1 });

    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch non-GST bills' });
  }
});
// Add this to your seller-bills.js routes file
router.get('/suppliers', async (req, res) => {
  try {
    // Aggregate to get unique suppliers with bill counts
    const suppliers = await SellerBill.aggregate([
      {
        $group: {
          _id: {
            sellerId: '$sellerId',
            supplierName: '$supplierName',
            batchNumber: '$batchNumber'
          },
          billCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          sellerId: '$_id.sellerId',
          supplierName: '$_id.supplierName',
          batchNumber: '$_id.batchNumber',
          billCount: 1
        }
      },
      { $sort: { supplierName: 1, batchNumber: 1 } }
    ]);

    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

module.exports = router;