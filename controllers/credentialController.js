// controllers/credentialController.js
const AdminCredential = require('../models/AdminCredential');
const CashierUser = require('../models/CashierUser');

// Save or update admin credentials
exports.saveAdmin = async (req, res) => {
  try {
    const { username, contactNumber, password } = req.body;

    // Check if any admin already exists (only one allowed)
    const existing = await AdminCredential.findOne();
    if (existing) {
      existing.username = username;
      existing.contactNumber = contactNumber;
      existing.password = password;
      await existing.save();
      return res.status(200).json({ message: 'Admin updated successfully', admin: existing });
    }

    const newAdmin = new AdminCredential({ username, contactNumber, password });
    await newAdmin.save();
    res.status(201).json({ message: 'Admin created successfully', admin: newAdmin });
  } catch (error) {
    res.status(500).json({ message: 'Error saving admin', error });
  }
};

// Save new cashier user every time
exports.saveUser = async (req, res) => {
  try {
    const newUser = new CashierUser(req.body);
     console.log("➡️ Received cashier user data:", req.body); // ✅ Add this line
    await newUser.save();
    res.status(201).json({ message: 'Cashier added successfully', user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Error saving user', error });
     console.error("❌ Error saving user:", error); // ✅ Add this line
  }
};
// Get admin
exports.getAdmin = async (req, res) => {
  try {
    const admin = await AdminCredential.findOne();
    if (!admin) {
      return res.status(404).json({ message: "No admin found" });
    }
    res.status(200).json(admin);
  } catch (error) {
    res.status(500).json({ message: "Error fetching admin", error });
  }
};

// Get all cashier users
exports.getUsers = async (req, res) => {
  try {
    const users = await CashierUser.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users", error });
  }
};
