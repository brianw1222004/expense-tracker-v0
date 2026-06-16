// Minimal react-native mock for Jest unit tests of pure-logic modules.
// sync.js imports AppState and Platform; neither is exercised by the tests
// targeting coalesce/applyPendingOps logic.
const AppState = {
  addEventListener: () => ({ remove: () => {} }),
  currentState: 'active',
};

const Platform = {
  OS: 'ios',
  select: (obj) => obj.ios ?? obj.default,
};

module.exports = { AppState, Platform };
