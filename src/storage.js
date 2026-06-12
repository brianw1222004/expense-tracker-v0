import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CURRENCY } from './currency';

const STORAGE_KEY = '@expense-tracker/expenses';
const SETTINGS_KEY = '@expense-tracker/settings';

// monthlyBudget is in the display currency; 0 means "no budget set".
export const DEFAULT_SETTINGS = {
  displayCurrency: DEFAULT_CURRENCY,
  monthlyBudget: 0,
};

export async function loadExpenses() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
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

export async function saveExpenses(expenses) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch {
    // Persistence is best-effort in this demo; in-memory state stays correct.
  }
}

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort, same as expenses.
  }
}
