require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const billsRoutes = require('./routes/billsRoutes');
const adminProductRoutes = require('./routes/adminProductRoutes');
const stockRoutes = require('./routes/stockRoutes');
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/CompanyRoutes.js');
const credentialRoutes = require('./routes/credentialRoutes');
const Admin = require('./models/Admin');
const app = express();
const customerRoutes = require('./routes/customerRoutes');
const sellerbillRoutes = require('./routes/sellerBills');
// Middleware
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:5173',
//   credentials: true
// }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.send('Welcome to the Billing Software API');
});
// MongoDB connection
const mongoURI = 'mongodb+srv://Dinakaran:dinakaran@mongodb.4h29m.mongodb.net/billingdb?retryWrites=true&w=majority&appName=Mongodb';
mongoose.connect(mongoURI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    const existingAdmin = await Admin.findOne({ username: 'admin' });
    if (!existingAdmin) {
      const defaultAdmin = new Admin({ username: 'admin', password: 'password' });
      await defaultAdmin.save();
      console.log('✅ Default admin created');
    }
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));


  const fs = require('fs');
const uploadDirs = [
  path.join(__dirname, 'uploads/gst_bills'),
  path.join(__dirname, 'uploads/non_gst_bills')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});


// Routes
app.use('/api/bills', billsRoutes);
app.use('/api/products', adminProductRoutes);
app.use('/api', stockRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/seller-bills', sellerbillRoutes);
// Server

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});