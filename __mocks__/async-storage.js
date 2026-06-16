// Minimal AsyncStorage mock for Jest unit tests.
// Tests that exercise sync.js's enqueue() path need a working getItem/setItem;
// tests that only call applyPendingOps() never touch AsyncStorage at all.
const store = {};

const AsyncStorage = {
  getItem: jest.fn(async (key) => store[key] ?? null),
  setItem: jest.fn(async (key, value) => { store[key] = value; }),
  removeItem: jest.fn(async (key) => { delete store[key]; }),
  clear: jest.fn(async () => { Object.keys(store).forEach((k) => delete store[k]); }),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
