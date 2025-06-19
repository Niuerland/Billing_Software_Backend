const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

// Import controllers
const {
  registerCompany,
  getAllCompanies,     // ✅ Add this function from controller
  getCompanyById       // ✅ Optional: fetch single company
} = require("../controllers/CompanyController");

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ✅ POST - Register a company
router.post(
  "/register",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "signature", maxCount: 1 },
  ]),
  registerCompany
);

// ✅ GET - Get all companies
router.get("/", getAllCompanies);

// ✅ Optional - Get a company by ID
router.get("/:id", getCompanyById);

module.exports = router;
