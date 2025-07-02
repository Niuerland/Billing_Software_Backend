const Counter = require('../models/Counter');

async function getNextCustomerId() {
  const result = await Counter.findOneAndUpdate(
    { name: 'customer' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return result.value;
}

module.exports = getNextCustomerId;
