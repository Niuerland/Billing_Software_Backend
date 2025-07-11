const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

async function getNextCustomerId() {
  const lastCustomer = await Customer.findOne().sort({ id: -1 });
  return lastCustomer ? lastCustomer.id + 1 : 1000;
}
function formatAadhaar(aadhaar) {
  if (!aadhaar) return '';
  const digits = aadhaar.replace(/\D/g, '');
  if (digits.length !== 12) return aadhaar; // Return as-is if invalid
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

// POST /api/customers - Create new customer
router.post('/', async (req, res) => {
  try {
    const { name, contact, aadhaar, location } = req.body;

    // Basic validation
    if (!name || !contact) {
      return res.status(400).json({ message: 'Name and contact are required' });
    }

    // Check if contact already exists
    const existingByContact = await Customer.findOne({ contact });
    if (existingByContact) {
      return res.status(409).json({
        message: 'Customer with this contact already exists',
        customer: existingByContact
      });
    }

    // Check if Aadhaar already exists (if provided)
    if (aadhaar) {
      const existingByAadhaar = await Customer.findOne({
        aadhaar: aadhaar.replace(/\D/g, '')
      });
      if (existingByAadhaar) {
        return res.status(409).json({
          message: 'Customer with this Aadhaar already exists',
          customer: existingByAadhaar
        });
      }
    }

    // Create new customer
    const id = await getNextCustomerId();
    const customer = new Customer({
      id,
      name,
      contact,
      aadhaar: aadhaar ? aadhaar.replace(/\D/g, '') : undefined, // Store only digits
      location
    });

    await customer.save();

    // Return the created customer with formatted Aadhaar
    const responseCustomer = customer.toObject();
    if (responseCustomer.aadhaar) {
      responseCustomer.aadhaar = formatAadhaar(responseCustomer.aadhaar);
    }

    res.status(201).json(responseCustomer);

  } catch (err) {
    console.error('❌ Error creating customer:', err);

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: err.errors
      });
    }

    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/customers - Find customer by contact or Aadhaar
router.get('/', async (req, res) => {
  try {
    const { contact, aadhaar } = req.query;

    if (!contact && !aadhaar) {
      return res.status(400).json({
        message: 'Contact or Aadhaar number is required'
      });
    }

    let query = {};
    if (contact) query.contact = contact;
    if (aadhaar) query.aadhaar = aadhaar.replace(/\D/g, ''); // Search with digits only

    const customer = await Customer.findOne(query);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Format Aadhaar for display
    const responseCustomer = customer.toObject();
    if (responseCustomer.aadhaar) {
      responseCustomer.aadhaar = formatAadhaar(responseCustomer.aadhaar);
    }

    res.status(200).json(responseCustomer);

  } catch (err) {
    console.error('❌ Error fetching customer:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to format Aadhaar number for display
function formatAadhaar(aadhaar) {
  if (!aadhaar) return '';
  const digits = aadhaar.replace(/\D/g, '');
  if (digits.length !== 12) return aadhaar; // Return as-is if invalid
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

module.exports = router;