import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CURRENCY } from './currency';

const STORAGE_KEY = '@expense-tracker/expenses';
const INCOME_KEY = '@expense-tracker/income';
const SETTINGS_KEY = '@expense-tracker/settings';
const GROUPS_KEY = '@expense-tracker/groups';
const SPLITS_KEY = '@expense-tracker/splits';

// The cache is per-user so two accounts on one device never read each other's
// data. Local-only mode (Supabase not configured) uses this sentinel and keeps
// the original un-suffixed keys, so pre-auth installs keep their data.
export const LOCAL_USER = 'local';

function scopedKey(base, userId) {
  return userId === LOCAL_USER ? base : `${base}:${userId}`;
}

// monthlyBudget and every categoryBudgets value are in the display currency;
// 0 / missing means "no budget set". theme / language / categoryBudgets are
// DEVICE-LOCAL: the Supabase settings row only has display_currency and
// monthly_budget columns, so sync.js never pushes the extra fields and App.js
// merges pulls over the local settings instead of replacing them — pushing
// unknown columns would error and wedge the whole pending-ops queue.
export const DEFAULT_SETTINGS = {
  displayCurrency: DEFAULT_CURRENCY,
  monthlyBudget: 0,
  categoryBudgets: {},
  customCategories: [],
  theme: 'neutral',
  language: 'en',
  firstName: '',
  lastName: '',
  categoryOrder: [],
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
  try {
    await AsyncStorage.setItem(scopedKey(STORAGE_KEY, userId), JSON.stringify(expenses));
  } catch {
    // Persistence is best-effort in this demo; in-memory state stays correct.
  }
}

// Income entries mirror expenses: client-generated ids, amount in the ENTRY
// currency, createdAt epoch-ms, plus a `source` and optional `note`.
export async function loadIncome(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(INCOME_KEY, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => ({
      ...e,
      currency: e.currency || DEFAULT_CURRENCY,
      source: e.source || 'other',
      note: e.note ?? '',
    }));
  } catch {
    return [];
  }
}

export async function saveIncome(userId, income) {
  try {
    await AsyncStorage.setItem(scopedKey(INCOME_KEY, userId), JSON.stringify(income));
  } catch {
    // Best-effort, same as expenses.
  }
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
  if (!Array.isArray(merged.categoryOrder)) {
    merged.categoryOrder = [];
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
    // One-time migration: older builds stored the category drag-order under a
    // standalone key. Fold it into settings so it lives under the same
    // dataUser-gated lifecycle as the rest of the settings.
    if (merged.categoryOrder.length === 0) {
      const legacy = await loadCategoryOrder(userId);
      if (Array.isArray(legacy) && legacy.length) merged.categoryOrder = legacy;
    }
    return merged;
  } catch {
    return withDefaults(null);
  }
}

export async function saveSettings(userId, settings) {
  try {
    await AsyncStorage.setItem(scopedKey(SETTINGS_KEY, userId), JSON.stringify(settings));
  } catch {
    // Best-effort, same as expenses.
  }
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
      paymentMethod: g.paymentMethod || 'cash',
      members: Array.isArray(g.members) ? g.members : [],
    }));
  } catch {
    return [];
  }
}

export async function saveGroups(userId, groups) {
  try {
    await AsyncStorage.setItem(scopedKey(GROUPS_KEY, userId), JSON.stringify(groups));
  } catch {
    // Best-effort, same as expenses.
  }
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
  try {
    await AsyncStorage.setItem(scopedKey(SPLITS_KEY, userId), JSON.stringify(splits));
  } catch {
    // Best-effort, same as expenses.
  }
}

const CATEGORY_ORDER_KEY = '@expense-tracker/category-order';

export async function loadCategoryOrder(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(CATEGORY_ORDER_KEY, userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Wipe every cached key for one user (used by "delete account"). Best-effort,
// like the rest of this layer — in-memory state is reset separately by the caller.
export async function clearUserStorage(userId) {
  const keys = [
    STORAGE_KEY,
    INCOME_KEY,
    SETTINGS_KEY,
    GROUPS_KEY,
    SPLITS_KEY,
    CATEGORY_ORDER_KEY,
  ].map((base) => scopedKey(base, userId));
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // Best-effort.
  }
}
