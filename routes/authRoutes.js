const express = require("express");
const router = express.Router();
const Admin = require("../models/Admin");

// Login route
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });

    if (!admin || admin.password !== password) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    res.json({ message: "Login successful" });
  } catch (err) {
    res.status(500).json({ message: "Login error" });
  }
});

// Update admin credentials
router.put("/update", async (req, res) => {
  const { currentUsername, currentPassword, newUsername, newPassword } = req.body;

  try {
    const admin = await Admin.findOne({ username: currentUsername });

    if (!admin || admin.password !== currentPassword) {
      return res.status(401).json({ message: "Invalid current credentials" });
    }

    admin.username = newUsername || admin.username;
    admin.password = newPassword || admin.password;

    await admin.save();

    res.json({ message: "Admin credentials updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Update error" });
  }
});

module.exports = router;
