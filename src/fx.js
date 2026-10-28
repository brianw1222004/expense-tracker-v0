import { CURRENCIES } from './currency';

// FX-1 is opt-in pure logic. Production money.js still uses legacy convert().
const minorUnits = new Map(CURRENCIES.map(({ code, decimals }) => [code, decimals]));
const quoteFields = new Set([
  'baseCurrency', 'quoteCurrency', 'rate', 'effectiveDate', 'sourceType',
  'provider', 'origin', 'retrievedAt',
]);
const invalid = (reason) => ({ valid: false, reason });
const isRecord = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const isLabel = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value;

// Inspect descriptors without invoking getters. Only accepted fields are copied;
// unrelated money fields are ignored. Frozen and null-prototype records work too.
function dataSnapshot(record, fields) {
  if (!isRecord(record)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(record);
  const snapshot = Object.create(null);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, field)) continue;
    const descriptor = descriptors[field];
    if (!('value' in descriptor) || !descriptor.enumerable) return null;
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

export function isFxCurrency(code) {
  return typeof code === 'string' && code.length === 3 && /^[A-Z]{3}$/.test(code) && minorUnits.has(code);
}

// Gregorian date validation without parsing in the device's time zone or
// allowing Date to normalize an impossible day into a different month.
export function isFxDate(value) {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function isRetrievalTimestamp(value) {
  if (typeof value !== 'string' || ![20, 24].includes(value.length)) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) return false;
  if (!isFxDate(value.slice(0, 10))) return false;
  return Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}

function readFxMoney(input) {
  const money = dataSnapshot(input, ['amount', 'currency']);
  if (!money) return invalid('invalid-money');
  if (typeof money.amount !== 'number' || !Number.isFinite(money.amount)) return invalid('invalid-amount');
  if (!isFxCurrency(money.currency)) return invalid('invalid-currency');
  return { valid: true, snapshot: money };
}

export function validateFxMoney(money) {
  const validation = readFxMoney(money);
  return validation.valid ? { valid: true } : validation;
}

/**
 * Quote direction: 1 baseCurrency unit = rate quoteCurrency units.
 * Historical quotes require provider + UTC retrievedAt; manual/legacy quotes
 * require origin instead. effectiveDate is always a separate calendar date.
 */
function readFxQuote(input) {
  if (!isRecord(input)) return invalid('invalid-quote');
  if (Object.keys(input).some((key) => !quoteFields.has(key))) return invalid('unknown-quote-field');
  const quote = dataSnapshot(input, quoteFields);
  if (!quote) return invalid('invalid-quote');
  if (!isFxCurrency(quote.baseCurrency) || !isFxCurrency(quote.quoteCurrency)) return invalid('invalid-currency');
  if (quote.baseCurrency === quote.quoteCurrency) return invalid('identical-quote-pair');
  if (typeof quote.rate !== 'number' || !Number.isFinite(quote.rate) || quote.rate <= 0) return invalid('invalid-rate');
  if (!isFxDate(quote.effectiveDate)) return invalid('invalid-effective-date');

  if (quote.sourceType === 'historical') {
    if (!isLabel(quote.provider) || 'origin' in quote) return invalid('invalid-provenance');
    if (!isRetrievalTimestamp(quote.retrievedAt)) return invalid('invalid-retrieval-timestamp');
    // FX-1 accepts completed-date observations only, not provisional quotes
    // published before their declared effective calendar date.
    if (quote.retrievedAt.slice(0, 10) < quote.effectiveDate) return invalid('retrieval-before-effective-date');
  } else if (quote.sourceType === 'manual' || quote.sourceType === 'legacy-estimate') {
    if (!isLabel(quote.origin) || 'provider' in quote || 'retrievedAt' in quote) return invalid('invalid-provenance');
  } else {
    return invalid('invalid-source-type');
  }
  return { valid: true, snapshot: quote };
}

export function validateFxQuote(quote) {
  const validation = readFxQuote(quote);
  return validation.valid ? { valid: true } : validation;
}

// Shared by the pure valuation and provider/cache boundaries, after date and
// quote validation. UTC midnight subtraction counts calendar days across DST.
export function fxDateMismatchReason(effectiveDate, transactionDate, sourceType, datePolicy = 'exact') {
  if (datePolicy !== 'exact' && datePolicy !== 'previous-observation') return 'invalid-date-policy';
  if (effectiveDate > transactionDate) return 'future-effective-date';
  if (effectiveDate === transactionDate) return null;
  if (datePolicy === 'exact' || sourceType !== 'historical') return 'effective-date-mismatch';
  const age = (Date.parse(transactionDate + 'T00:00:00Z') - Date.parse(effectiveDate + 'T00:00:00Z')) / 86400000;
  return age <= 7 ? null : 'observation-too-old';
}

/**
 * Value an original { amount, currency } using one explicitly supplied quote.
 * This does not select rates or determine settlement authority. No clock,
 * provider, legacy fallback, inversion, or intermediate rounding is involved.
 */
export function valueWithFxQuote(original, targetCurrency, transactionDate, quote = null, options = {}) {
  const moneyValidation = readFxMoney(original);
  if (!moneyValidation.valid) return { status: 'invalid-input', reason: moneyValidation.reason };
  if (!isFxCurrency(targetCurrency)) return { status: 'invalid-input', reason: 'invalid-target-currency' };
  if (!isFxDate(transactionDate)) return { status: 'invalid-input', reason: 'invalid-transaction-date' };
  const datePolicy = options?.datePolicy ?? 'exact';
  if (datePolicy !== 'exact' && datePolicy !== 'previous-observation') return { status: 'invalid-input', reason: 'invalid-date-policy' };

  const money = moneyValidation.snapshot;
  const context = {
    original: { ...money },
    currency: targetCurrency,
    transactionDate,
    minorUnits: minorUnits.get(targetCurrency),
  };
  if (money.currency === targetCurrency) {
    return { ...context, status: 'identity', amount: money.amount, source: 'identity', quote: null, isEstimate: false };
  }

  const missing = (reason) => ({ ...context, status: 'missing-rate', reason });
  if (quote == null) return missing('missing-quote');
  const quoteValidation = readFxQuote(quote);
  if (!quoteValidation.valid) return missing(quoteValidation.reason);
  const acceptedQuote = quoteValidation.snapshot;
  if (acceptedQuote.baseCurrency !== money.currency || acceptedQuote.quoteCurrency !== targetCurrency) return missing('pair-mismatch');
  const dateReason = fxDateMismatchReason(acceptedQuote.effectiveDate, transactionDate, acceptedQuote.sourceType, datePolicy);
  if (dateReason) return missing(dateReason);

  const amount = money.amount * acceptedQuote.rate;
  if (!Number.isFinite(amount) || (money.amount !== 0 && amount === 0)) return missing('unrepresentable-result');
  return {
    ...context,
    status: 'valued',
    amount,
    source: acceptedQuote.sourceType,
    quote: { ...acceptedQuote },
    isEstimate: acceptedQuote.sourceType === 'legacy-estimate',
  };
}

// Explicit display boundary only. The unrounded valuation/original is never
// rewritten. Number.toFixed is not a guarantee of exact decimal arithmetic.
export function formatFxAmount(amount, currency) {
  if (!isFxCurrency(currency) || typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return amount.toFixed(minorUnits.get(currency));
}
