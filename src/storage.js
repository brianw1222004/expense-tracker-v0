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

// monthlyBudget is in the display currency; 0 means "no budget set".
export const DEFAULT_SETTINGS = {
  displayCurrency: DEFAULT_CURRENCY,
  monthlyBudget: 0,
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

export async function loadSettings(userId) {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(SETTINGS_KEY, userId));
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(userId, settings) {
  try {
    await AsyncStorage.setItem(scopedKey(SETTINGS_KEY, userId), JSON.stringify(settings));
  } catch {
    // Best-effort, same as expenses.
  }
}
