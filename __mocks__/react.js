// Minimal React mock for Jest unit tests of pure-logic modules.
// i18n.js imports createContext/useCallback/useContext at module level;
// we stub them so tests can import i18n.js (and by extension format.js)
// without pulling in the full React runtime.
const noop = () => {};
const createContext = (defaultValue) => ({ _default: defaultValue });
const useCallback = (fn) => fn;
const useContext = (ctx) => ctx._default;

module.exports = { createContext, useCallback, useContext };
module.exports.default = module.exports;
