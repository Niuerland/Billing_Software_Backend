// routes/customers.js
const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

// Helper function to get the next customer ID
async function getNextCustomerId() {
  // Finds the customer with the highest 'id' and assigns the next number.
  // Starts from 1000 if no customers exist.
  const lastCustomer = await Customer.findOne().sort({ id: -1 });
  return lastCustomer ? lastCustomer.id + 1 : 1000;
}

// Helper function to format Aadhaar number for display
function formatAadhaar(aadhaar) {
  if (!aadhaar) return '';
  const digits = aadhaar.replace(/\D/g, ''); // Remove non-digits
  if (digits.length !== 12) return aadhaar; // Return as-is if not 12 digits
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

router.post('/', async (req, res) => {
  try {
    const { name, contact, aadhaar, location } = req.body;

    if (!name || !contact) {
      return res.status(400).json({ message: 'Name and contact are required.' });
    }

    // Check if contact already exists
    const existingByContact = await Customer.findOne({ contact });
    if (existingByContact) {
      // If customer exists by contact, return them with their details (including outstandingCredit)
      const responseCustomer = existingByContact.toObject();
      if (responseCustomer.aadhaar) {
        responseCustomer.aadhaar = formatAadhaar(responseCustomer.aadhaar);
      }
      return res.status(200).json({ // Return 200 OK as we are returning existing data
        message: 'Customer with this contact already exists.',
        customer: responseCustomer
      });
    }

    // Check if Aadhaar already exists (if provided)
    const cleanedAadhaar = aadhaar ? aadhaar.replace(/\D/g, '') : undefined;
    if (cleanedAadhaar) {
      const existingByAadhaar = await Customer.findOne({ aadhaar: cleanedAadhaar });
      if (existingByAadhaar) {
        const responseCustomer = existingByAadhaar.toObject();
        if (responseCustomer.aadhaar) {
          responseCustomer.aadhaar = formatAadhaar(responseCustomer.aadhaar);
        }
        return res.status(200).json({ // Return 200 OK
          message: 'Customer with this Aadhaar already exists.',
          customer: responseCustomer
        });
      }
    }

    // Create a truly new customer
    const id = await getNextCustomerId();
    const customer = new Customer({
      id,
      name,
      contact,
      aadhaar: cleanedAadhaar,
      location,
      outstandingCredit: 0 // New customers always start with 0 outstanding credit
    });

    await customer.save();

    const responseCustomer = customer.toObject();
    if (responseCustomer.aadhaar) {
      responseCustomer.aadhaar = formatAadhaar(responseCustomer.aadhaar);
    }

    res.status(201).json(responseCustomer); // 201 Created for a newly created resource

  } catch (err) {
    console.error('❌ Error creating customer:', err);

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: err.errors
      });
    }
    // Catch any unexpected duplicate key errors (e.g., race conditions)
    if (err.code === 11000) {
        let field = Object.keys(err.keyPattern)[0];
        let value = err.keyValue[field];
        return res.status(409).json({
            message: `Customer with this ${field} (${value}) already exists.`,
        });
    }

    res.status(500).json({ message: 'Server error while creating customer.' });
  }
});

// GET /api/customers - Find customer by contact or Aadhaar - CRITICAL FOR FETCHING OUTSTANDING CREDIT
router.get('/', async (req, res) => {
  try {
    const { contact, aadhaar } = req.query;

    if (!contact && !aadhaar) {
      return res.status(400).json({
        message: 'Either contact number or Aadhaar number is required to search for a customer.'
      });
    }

    let query = {};
    if (contact) query.contact = contact;
    if (aadhaar) query.aadhaar = aadhaar.replace(/\D/g, ''); // Search using digits only

    const customer = await Customer.findOne(query);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    // Format Aadhaar for display in the response
    const responseCustomer = customer.toObject();
    if (responseCustomer.aadhaar) {
      responseCustomer.aadhaar = formatAadhaar(responseCustomer.aadhaar);
    }

    // This response automatically includes the 'outstandingCredit' field,
    // which the frontend will use to display previous outstanding amounts.
    res.status(200).json(responseCustomer);

  } catch (err) {
    console.error('❌ Error fetching customer:', err);
    res.status(500).json({ message: 'Server error while fetching customer.' });
  }
});

// GET /api/customers/:id - Find customer by their internal 'id' field (numeric)
router.get('/:id', async (req, res) => {
    try {
        const customerId = parseInt(req.params.id); // Ensure ID is parsed as integer
        if (isNaN(customerId)) {
            return res.status(400).json({ message: 'Invalid customer ID provided.' });
        }

        const customer = await Customer.findOne({ id: customerId });
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found.' });
        }

        const responseCustomer = customer.toObject();
        if (responseCustomer.aadhaar) {
            responseCustomer.aadhaar = formatAadhaar(responseCustomer.aadhaar);
        }
        res.status(200).json(responseCustomer);
    } catch (err) {
        console.error('❌ Error fetching customer by ID:', err);
        res.status(500).json({ message: 'Server error fetching customer by ID.' });
    }
});

// GET /api/customers/all - Get all customers
router.get('/all', async (req, res) => {
  try {
    const customers = await Customer.find().lean();
    res.status(200).json(customers);
  } catch (err) {
    console.error('Error fetching all customers:', err);
    res.status(500).json({ message: 'Failed to fetch customers', error: err.message });
  }
});


module.exports = router;