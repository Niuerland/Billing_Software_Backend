const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

async function getNextCustomerId() {
  const lastCustomer = await Customer.findOne().sort({ id: -1 });
  return lastCustomer ? lastCustomer.id + 1 : 1000;
}

// POST /api/customers
router.post('/', async (req, res) => {
  try {
    const { name, contact } = req.body;

    if (!name || !contact) {
      return res.status(400).json({ message: 'Name and contact required' });
    }

    const exists = await Customer.findOne({ contact });
    if (exists) {
      return res.status(409).json({ message: 'Customer already exists', customer: exists });
    }

    const id = await getNextCustomerId();
    const customer = new Customer({ id, name, contact });
    await customer.save();

    res.status(201).json(customer);
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET - Find by contact
router.get('/', async (req, res) => {
  try {
    const { contact } = req.query;
    if (!contact) return res.status(400).json({ message: 'Contact required' });

    const customer = await Customer.findOne({ contact });
    if (!customer) return res.status(404).json({ message: 'Not found' });

    res.status(200).json(customer);
  } catch (err) {
    res.status(500).json({ message: 'Fetch error' });
  }
});

module.exports = router;
