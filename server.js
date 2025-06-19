const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const billsRoutes = require('./routes/billsRoutes');
const adminProductRoutes = require('./routes/adminProductRoutes');
const stockRoutes = require('./routes/stockRoutes');
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const credentialRoutes = require('./routes/credentialRoutes');

const Admin = require('./models/Admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const mongoURI = 'mongodb+srv://leanderxavier71:Leando17@leander.kkrf4yz.mongodb.net/billingdb?retryWrites=true&w=majority';

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

// Routes
app.use('/api/bills', billsRoutes);
app.use('/api/products', adminProductRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/credentials', credentialRoutes);

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
