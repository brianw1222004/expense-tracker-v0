import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CURRENCY } from './currency';
import { DEFAULT_PAYMENT_METHOD_ID } from './splits';

const STORAGE_KEY = '@expense-tracker/expenses';
const SETTINGS_KEY = '@expense-tracker/settings';
const GROUPS_KEY = '@expense-tracker/groups';
const SPLITS_KEY = '@expense-tracker/splits';

// Observe outstanding cache writes so strict local deletion can drain them
// before removing keys. Ordinary saves retain their best-effort behavior.
const pendingWrites = new Map();

async function saveCache(userId, key, value) {
  const writes = pendingWrites.get(userId) ?? new Set();
  pendingWrites.set(userId, writes);
  const write = (async () => {
    try {
      await AsyncStorage.setItem(scopedKey(key, userId), JSON.stringify(value));
    } catch {
      // Ordinary persistence remains best-effort.
    }
  })();
  writes.add(write);
  try {
    await write;
  } finally {
    writes.delete(write);
    if (writes.size === 0) pendingWrites.delete(userId);
  }
}

// The cache is per-user so two accounts on one device never read each other's
// data. Local-only mode (Supabase not configured) uses this sentinel and keeps
// the original un-suffixed keys, so pre-auth installs keep their data.
export const LOCAL_USER = 'local';

function scopedKey(base, userId) {
  return userId === LOCAL_USER ? base : `${base}:${userId}`;
}

// monthlyBudget and every categoryBudgets value are in the display currency;
// 0 / missing means "no budget set". Everything here syncs through the Supabase
// settings row (see toSettingsRow in sync.js) EXCEPT theme / language /
// onboardingDone, which are per-device preferences and stay DEVICE-LOCAL.
// Pulled settings are merged over local (never replace it), and sync.js omits
// server columns that are NULL — i.e. no device has pushed them yet — so the
// local value always stands until something is actually synced.
export const DEFAULT_SETTINGS = {
  displayCurrency: DEFAULT_CURRENCY,
  monthlyBudget: 0,
  categoryBudgets: {},
  // Manual tile order on the Insight Categories grid (drag-to-reorder);
  // null = spend-sorted.
  categoryOrder: null,
  customCategories: [],
  customPaymentMethods: [],
  theme: 'neutral',
  language: 'en',
  onboardingDone: false,
};

export async function loadExpenses(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(STORAGE_KEY, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Entries saved before multi-currency lack a currency; the rest of the app
    // assumes the field exists, so normalize here at the load boundary.
    return parsed.map((e) => (e.currency ? e : { ...e, currency: DEFAULT_CURRENCY }));
  } catch {
    return [];
  }
}

export async function saveExpenses(userId, expenses) {
  await saveCache(userId, STORAGE_KEY, expenses);
}

// Fresh categoryBudgets object every call — the shallow spread would otherwise
// hand out DEFAULT_SETTINGS' own object to be mutated.
function withDefaults(parsed) {
  const merged = {
    ...DEFAULT_SETTINGS,
    categoryBudgets: {},
    ...(parsed && typeof parsed === 'object' ? parsed : {}),
  };
  if (!merged.categoryBudgets || typeof merged.categoryBudgets !== 'object') {
    merged.categoryBudgets = {};
  }
  if (!Array.isArray(merged.customCategories)) {
    merged.customCategories = [];
  }
  if (!Array.isArray(merged.customPaymentMethods)) {
    merged.customPaymentMethods = [];
  }
  if (parsed && typeof parsed === 'object' && parsed.onboardingDone === undefined) {
    merged.onboardingDone = true;
  }
  return merged;
}

export async function loadSettings(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(SETTINGS_KEY, userId));
    const merged = withDefaults(raw ? JSON.parse(raw) : null);
    return merged;
  } catch {
    return withDefaults(null);
  }
}

export async function saveSettings(userId, settings) {
  await saveCache(userId, SETTINGS_KEY, settings);
}

// Split-bills groups and shared bills — synced to Supabase via the groups and
// splits lanes in sync.js (queue keys ${userId}::groups / ${userId}::splits).
// The local cache here is the fast-read layer; pulls are tolerant so a missing
// table leaves this cache intact. Loads are tolerant: a corrupt/missing cache
// yields an empty list and the app still boots.
export async function loadGroups(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(GROUPS_KEY, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((g) => ({
      ...g,
      currency: g.currency || DEFAULT_CURRENCY,
      paymentMethod: g.paymentMethod || DEFAULT_PAYMENT_METHOD_ID,
      members: Array.isArray(g.members) ? g.members : [],
    }));
  } catch {
    return [];
  }
}

export async function saveGroups(userId, groups) {
  await saveCache(userId, GROUPS_KEY, groups);
}

export async function loadSplitExpenses(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(SPLITS_KEY, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => ({ ...s, currency: s.currency || DEFAULT_CURRENCY }));
  } catch {
    return [];
  }
}

export async function saveSplitExpenses(userId, splits) {
  await saveCache(userId, SPLITS_KEY, splits);
}

// Legacy keys from retired features (category drag-reorder, income tracking) —
// kept only so clearUserStorage still wipes them from old installs.
const CATEGORY_ORDER_KEY = '@expense-tracker/category-order';
const LEGACY_INCOME_KEY = '@expense-tracker/income';

// A wedged AsyncStorage write (storage full, native module stall) must not hold
// the locked Account sheet forever. Giving up BEFORE the removal starts means a
// timed-out drain never deletes anything later, behind the user's back.
const DRAIN_TIMEOUT_MS = 5000;

async function drainPendingWrites(userId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (pendingWrites.get(userId)?.size) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Pending cache writes did not settle');
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Pending cache writes did not settle')), remaining);
    });
    try {
      await Promise.race([Promise.all([...pendingWrites.get(userId)]), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

// Strict mode is for verified Delete All Data. Default behavior remains
// best-effort for existing callers.
export async function clearUserStorage(
  userId,
  { strict = false, drainTimeoutMs = DRAIN_TIMEOUT_MS, signal } = {}
) {
  const keys = [
    STORAGE_KEY,
    LEGACY_INCOME_KEY,
    SETTINGS_KEY,
    GROUPS_KEY,
    SPLITS_KEY,
    CATEGORY_ORDER_KEY,
  ].map((base) => scopedKey(base, userId));
  try {
    if (strict) {
      await drainPendingWrites(userId, drainTimeoutMs);
      // Same rule the drain follows: a caller that has already given up and
      // reported failure must not have these keys removed a moment later.
      if (signal?.aborted) throw new Error('Local tracker cleanup cancelled');
    }
    await AsyncStorage.multiRemove(keys);
    if (strict) {
      const remaining = await Promise.all(keys.map((key) => AsyncStorage.getItem(key)));
      if (remaining.some((value) => value !== null)) throw new Error('Local tracker cleanup incomplete');
    }
  } catch (error) {
    if (strict) throw error;
    // Best-effort.
  }
}
