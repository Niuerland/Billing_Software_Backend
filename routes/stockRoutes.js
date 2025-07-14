// routes/stock.js
const express = require('express');
const router = express.Router();
const { getStockSummary } = require('../controllers/stockController');

router.get('/stock-summary', getStockSummary);

module.exports = router;