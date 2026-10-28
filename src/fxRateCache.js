import AsyncStorage from '@react-native-async-storage/async-storage';
import { isFxCurrency, isFxDate, validateFxQuote, fxDateMismatchReason } from './fx';
import { snapshotFxRequest } from './fxProvider';

export const FX_CACHE_MAX_ENTRIES = 100;
export const FX_CACHE_PROVIDER = 'frankfurter-v2:BOC';
const PREFIX = '@expense-tracker/fx-rates/v1:';
const MAX_RECORD_CHARS = 262144;

const validScope = (scope) => typeof scope === 'string' && scope.length > 0 && scope.trim() === scope;
const entryKey = (request) => JSON.stringify([
  FX_CACHE_PROVIDER, request.baseCurrency, request.quoteCurrency, request.transactionDate,
]);

// Copy only quote/provenance fields: no amounts, notes, or transaction records.
function observationRecord(input, result) {
  const request = snapshotFxRequest(input);
  if (!request || !isFxCurrency(request.baseCurrency) || !isFxCurrency(request.quoteCurrency)
      || !isFxDate(request.transactionDate) || result?.status !== 'available') return null;
  if (!validateFxQuote(result.quote).valid) return null;
  const quote = { ...result.quote };
  if (quote.sourceType !== 'historical' || quote.provider !== FX_CACHE_PROVIDER
      || quote.baseCurrency !== request.baseCurrency || quote.quoteCurrency !== request.quoteCurrency
      || fxDateMismatchReason(quote.effectiveDate, request.transactionDate, quote.sourceType, 'previous-observation')) return null;
  const p = result.provenance;
  const classification = request.quoteCurrency === 'CAD' ? 'native' : 'provider-derived';
  const url = 'https://api.frankfurter.dev/v2/rates?base=' + request.baseCurrency
    + '&quotes=' + request.quoteCurrency + '&date=' + request.transactionDate + '&providers=BOC&expand=providers';
  if (!p || p.service !== 'frankfurter-v2' || p.source !== 'BOC' || p.url !== url
      || p.classification !== classification || p.observationDate !== quote.effectiveDate
      || p.retrievedAt !== quote.retrievedAt || p.httpStatus !== 200
      || p.requested?.baseCurrency !== request.baseCurrency || p.requested?.quoteCurrency !== request.quoteCurrency
      || p.requested?.transactionDate !== request.transactionDate
      || !Array.isArray(p.attribution) || p.attribution.length !== 1) return null;
  const source = p.attribution[0];
  if (!source || source.key !== 'BOC' || source.rate !== quote.rate || source.date !== quote.effectiveDate
      || (source.excluded !== undefined && source.excluded !== false)) return null;
  const attribution = { key: 'BOC', rate: source.rate, date: source.date };
  if (source.excluded === false) attribution.excluded = false;
  return {
    key: entryKey(request), quote,
    provenance: {
      service: 'frankfurter-v2', source: 'BOC', requested: request, url, classification,
      httpStatus: 200, observationDate: quote.effectiveDate, retrievedAt: quote.retrievedAt,
      attribution: [attribution],
    },
  };
}

/** One bounded JSON record per exact user scope. Reuse one instance so writes
 * and explicit clears are serialized; reads wait for pending writes too.
 * get -> observation or null; set/clear -> boolean (storage errors are safe).
 */
export function createFxRateCache(storage = AsyncStorage) {
  let pending = Promise.resolve();
  const storageKey = (scope) => PREFIX + JSON.stringify(scope);
  const enqueue = (work) => {
    const task = pending.then(work);
    pending = task.catch(() => {});
    return task;
  };
  async function readEntries(scope) {
    const raw = await storage.getItem(storageKey(scope));
    if (!raw || raw.length > MAX_RECORD_CHARS) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.entries) || data.entries.length > FX_CACHE_MAX_ENTRIES) return [];
    return data.entries.map((entry) => {
      const record = observationRecord(entry?.provenance?.requested, { status: 'available', ...entry });
      return record?.key === entry?.key ? record : null;
    }).filter(Boolean);
  }
  return {
    async get(scope, input) {
      if (!validScope(scope)) return null;
      try {
        const request = snapshotFxRequest(input);
        if (!request) return null;
        await pending;
        const entry = (await readEntries(scope)).find((record) => record.key === entryKey(request));
        return entry ? { quote: entry.quote, provenance: entry.provenance } : null;
      } catch { return null; }
    },
    async set(scope, input, result, { signal } = {}) {
      if (!validScope(scope)) return false;
      try {
        const record = observationRecord(input, result);
        if (!record) return false;
        return await enqueue(async () => {
          if (signal?.aborted) return false;
          let entries;
          try { entries = await readEntries(scope); } catch { entries = []; }
          entries = entries.filter((entry) => entry.key !== record.key);
          entries.push(record);
          const raw = JSON.stringify({ version: 1, entries: entries.slice(-FX_CACHE_MAX_ENTRIES) });
          if (raw.length > MAX_RECORD_CHARS) return false;
          if (signal?.aborted) return false;
          await storage.setItem(storageKey(scope), raw);
          return true;
        });
      } catch { return false; }
    },
    async clear(scope, { signal, strict = false } = {}) {
      if (!validScope(scope)) return false;
      try {
        return await enqueue(async () => {
          if (signal?.aborted) throw new Error('FX cache cleanup cancelled');
          await storage.removeItem(storageKey(scope));
          if (strict && await storage.getItem(storageKey(scope)) !== null) throw new Error('FX cache cleanup incomplete');
          return true;
        });
      } catch (error) { if (strict) throw error; return false; }
    },
  };
}

// Creating the inactive default instance does not read or write storage.
export const fxRateCache = createFxRateCache();
