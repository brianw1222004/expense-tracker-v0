import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CURRENCY } from './currency';

const STORAGE_KEY = '@expense-tracker/expenses';
const SETTINGS_KEY = '@expense-tracker/settings';

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
  theme: 'cookie',
  language: 'en',
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
  return merged;
}

export async function loadSettings(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(SETTINGS_KEY, userId));
    if (!raw) return withDefaults(null);
    return withDefaults(JSON.parse(raw));
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
