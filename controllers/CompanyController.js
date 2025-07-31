const Company = require("../models/Company");

// ✅ Register new company
exports.registerCompany = async (req, res) => {
  try {
    const {
      companyName,
      fullName,
      email,
      password,
      businessType,
      businessCategory,
      businessAddress,
      city,
      state,
      zip,
      country,
      mobile,
      gstNumber,
    } = req.body;

    const logo = req.files?.logo?.[0] || null;
    const signature = req.files?.signature?.[0] || null;

    const newCompany = new Company({
      businessName: companyName,
      phoneNumber: mobile,
      gstin: gstNumber,
      email,
      businessType,
      businessCategory,
      state,
      pincode: zip,
      address: businessAddress,
      logoUrl: logo ? `${process.env.BASE_URL}/uploads/${logo.filename}` : null,
      signatureUrl: signature ? `${process.env.BASE_URL}/uploads/${signature.filename}` : null,

    });

    await newCompany.save();

    res.status(201).json({
      message: "Company registered successfully",
      company: newCompany,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};



// ✅ Get all companies
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.status(200).json(companies);
  } catch (err) {
    console.error("Error fetching companies:", err);
    res.status(500).json({ message: "Server error" });
  }
};



// ✅ Optional: Get a single company by ID
exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.status(200).json(company);
  } catch (err) {
    console.error("Error fetching company:", err);
    res.status(500).json({ message: "Server error" });
  }
};
