const express = require('express');
const router = express.Router();
const {
  saveAdmin,
  saveUser,
  getAdmin,
  getUsers
} = require('../controllers/credentialController');

router.post('/admin', saveAdmin);
router.post('/users', saveUser);

router.get('/admin', getAdmin);
router.get('/users', getUsers);

module.exports = router;
