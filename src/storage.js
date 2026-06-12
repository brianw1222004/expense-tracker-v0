import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@expense-tracker/expenses';

export async function loadExpenses() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
