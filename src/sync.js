import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { DEFAULT_CURRENCY } from './currency';
import { DEFAULT_SETTINGS, LOCAL_USER } from './storage';

// Offline-first sync between the in-memory state (cached in AsyncStorage by
// storage.js) and Supabase. Every mutation is applied to local state first and
// enqueued here as a pending op; the queue is durable (survives restarts) and
// flushes whenever the app is online. Pulls fetch the server's rows and the
// caller re-applies any still-pending ops on top, so unsynced local changes
// are never lost. Conflict policy between devices: last write to the server
// wins, per row.
//
// Expenses and income use SEPARATE queues (keyed `userId` and `userId::income`)
// so a problem on one lane — e.g. the income table not yet created — can never
// wedge the other. The income pull is also tolerant: if it errors, the rest of
// the sync still succeeds and the local income cache stands.
//
// Expense/settings ops: { type:'upsert', expense } | { type:'delete', id }
//                       | { type:'replace', expenses } | { type:'settings', settings }
// Income ops:           { type:'upsert', income } | { type:'delete', id }
//                       | { type:'replace', incomes }

const QUEUE_KEY = '@expense-tracker/pending-ops';

// In-memory queues are the source of truth once loaded; AsyncStorage mirrors
// them so ops survive a restart. Keyed per lane (expense lane key = userId, so
// its storage key is unchanged from before; income lane key = `${userId}::income`).
const queues = new Map();
const queueLoads = new Map();
const flushes = new Map();

function incomeKey(userId) {
  return `${userId}::income`;
}

function canSync(userId) {
  return isSupabaseConfigured && Boolean(userId) && userId !== LOCAL_USER;
}

async function ensureQueueLoaded(key) {
  if (queues.has(key)) return queues.get(key);
  if (!queueLoads.has(key)) {
    queueLoads.set(
      key,
      (async () => {
        let ops = [];
        try {
          const raw = await AsyncStorage.getItem(`${QUEUE_KEY}:${key}`);
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) ops = parsed;
        } catch {
          // Corrupt/unreadable queue: start empty, same best-effort stance as
          // the cache. The server copy is intact either way.
        }
        if (!queues.has(key)) queues.set(key, ops);
        return queues.get(key);
      })()
    );
  }
  return queueLoads.get(key);
}

async function persistQueue(key) {
  try {
    await AsyncStorage.setItem(`${QUEUE_KEY}:${key}`, JSON.stringify(queues.get(key) ?? []));
  } catch {
    // Best-effort: the in-memory queue still flushes this session.
  }
}

// Drop queued ops the incoming op makes redundant (expense/settings lane).
// Removal is by value here and by identity in flush(), so the two never fight
// over array indices.
export function coalesce(queue, op) {
  const keep = (existing) => {
    if (op.type === 'settings') return existing.type !== 'settings';
    if (op.type === 'replace') return existing.type === 'settings';
    if (existing.type !== 'upsert') return true;
    if (op.type === 'upsert') return existing.expense.id !== op.expense.id;
    if (op.type === 'delete') return existing.expense.id !== op.id;
    return true;
  };
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!keep(queue[i])) queue.splice(i, 1);
  }
}

// Same coalescing for the income lane (no settings op exists there).
export function coalesceIncome(queue, op) {
  const keep = (existing) => {
    if (op.type === 'replace') return false;
    if (existing.type !== 'upsert') return true;
    if (op.type === 'upsert') return existing.income.id !== op.income.id;
    if (op.type === 'delete') return existing.income.id !== op.id;
    return true;
  };
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!keep(queue[i])) queue.splice(i, 1);
  }
}

async function enqueue(userId, op) {
  if (!canSync(userId)) return;
  const queue = await ensureQueueLoaded(userId);
  coalesce(queue, op);
  queue.push(op);
  await persistQueue(userId);
  flush(userId); // fire-and-forget; failures stay queued for the next trigger
}

async function enqueueIncome(userId, op) {
  if (!canSync(userId)) return;
  const key = incomeKey(userId);
  const queue = await ensureQueueLoaded(key);
  coalesceIncome(queue, op);
  queue.push(op);
  await persistQueue(key);
  flushIncome(userId); // fire-and-forget
}

export function enqueueExpenseUpsert(userId, expense) {
  return enqueue(userId, { type: 'upsert', expense });
}

export function enqueueExpenseDelete(userId, id) {
  return enqueue(userId, { type: 'delete', id });
}

export function enqueueExpensesReplace(userId, expenses) {
  return enqueue(userId, { type: 'replace', expenses });
}

export function enqueueSettingsPush(userId, settings) {
  return enqueue(userId, { type: 'settings', settings });
}

export function enqueueIncomeUpsert(userId, income) {
  return enqueueIncome(userId, { type: 'upsert', income });
}

export function enqueueIncomeDelete(userId, id) {
  return enqueueIncome(userId, { type: 'delete', id });
}

export function enqueueIncomeReplace(userId, incomes) {
  return enqueueIncome(userId, { type: 'replace', incomes });
}

// user_id is never sent: the column default (auth.uid()) fills it server-side,
// and Row Level Security guarantees we only ever touch our own rows.
function toRow(expense) {
  return {
    id: expense.id,
    amount: expense.amount,
    currency: expense.currency,
    note: expense.note ?? '',
    category: expense.category ?? 'other',
    created_at: expense.createdAt,
  };
}

function fromRow(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency || DEFAULT_CURRENCY,
    note: row.note ?? '',
    category: row.category,
    createdAt: Number(row.created_at),
  };
}

function toIncomeRow(income) {
  return {
    id: income.id,
    amount: income.amount,
    currency: income.currency,
    source: income.source ?? 'other',
    note: income.note ?? '',
    created_at: income.createdAt,
  };
}

function fromIncomeRow(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency || DEFAULT_CURRENCY,
    source: row.source || 'other',
    note: row.note ?? '',
    createdAt: Number(row.created_at),
  };
}

async function runOp(op, userId) {
  if (op.type === 'upsert') {
    const { error } = await supabase.from('expenses').upsert(toRow(op.expense));
    if (error) throw error;
  } else if (op.type === 'delete') {
    const { error } = await supabase.from('expenses').delete().eq('id', op.id).eq('user_id', userId);
    if (error) throw error;
  } else if (op.type === 'replace') {
    // Atomic-by-effect: upsert the new rows FIRST, then delete only the rows
    // that aren't in the new set. If the upsert fails nothing is deleted (the
    // old server state stands); if the delete fails the new rows are already in
    // place and the still-queued op simply retries. Every write is scoped to
    // this user via user_id (also PostgREST's required delete filter).
    if (op.expenses.length > 0) {
      const rows = op.expenses.map(toRow);
      const inserted = await supabase.from('expenses').upsert(rows);
      if (inserted.error) throw inserted.error;
      const keepIds = rows.map((r) => `"${r.id}"`).join(',');
      const cleared = await supabase
        .from('expenses')
        .delete()
        .eq('user_id', userId)
        .not('id', 'in', `(${keepIds})`);
      if (cleared.error) throw cleared.error;
    } else {
      const cleared = await supabase.from('expenses').delete().eq('user_id', userId);
      if (cleared.error) throw cleared.error;
    }
  } else if (op.type === 'settings') {
    const { error } = await supabase.from('settings').upsert({
      display_currency: op.settings.displayCurrency,
      monthly_budget: op.settings.monthlyBudget,
    });
    if (error) throw error;
  }
}

async function runIncomeOp(op, userId) {
  if (op.type === 'upsert') {
    const { error } = await supabase.from('income').upsert(toIncomeRow(op.income));
    if (error) throw error;
  } else if (op.type === 'delete') {
    const { error } = await supabase.from('income').delete().eq('id', op.id).eq('user_id', userId);
    if (error) throw error;
  } else if (op.type === 'replace') {
    // Atomic-by-effect, mirroring the expense lane: upsert first, then delete
    // only the rows not in the new set (or all rows when the new set is empty).
    if (op.incomes.length > 0) {
      const rows = op.incomes.map(toIncomeRow);
      const inserted = await supabase.from('income').upsert(rows);
      if (inserted.error) throw inserted.error;
      const keepIds = rows.map((r) => `"${r.id}"`).join(',');
      const cleared = await supabase
        .from('income')
        .delete()
        .eq('user_id', userId)
        .not('id', 'in', `(${keepIds})`);
      if (cleared.error) throw cleared.error;
    } else {
      const cleared = await supabase.from('income').delete().eq('user_id', userId);
      if (cleared.error) throw cleared.error;
    }
  }
}

// Push a lane's pending ops in order, stopping at the first failure (offline,
// expired session, missing table) — the rest stay queued. Single-flight per
// lane key; ops enqueued while a flush is running are picked up by the same loop.
function flushQueue(key, userId, runner) {
  if (!canSync(userId)) return Promise.resolve(false);
  if (flushes.has(key)) return flushes.get(key);
  const run = (async () => {
    const queue = await ensureQueueLoaded(key);
    while (queue.length > 0) {
      const op = queue[0];
      try {
        await runner(op, userId);
      } catch {
        return false;
      }
      const index = queue.indexOf(op);
      if (index !== -1) queue.splice(index, 1);
      await persistQueue(key);
    }
    return true;
  })().finally(() => flushes.delete(key));
  flushes.set(key, run);
  return run;
}

export function flush(userId) {
  return flushQueue(userId, userId, runOp);
}

export function flushIncome(userId) {
  return flushQueue(incomeKey(userId), userId, runIncomeOp);
}

// Re-apply a lane's pending ops on top of server state (synchronous, in-memory
// queue). Called by App.js at setState time so a mutation made while a pull was
// in flight still shows up in the merged result.
// Pure reducer (exported for tests): fold a lane's queued ops over server rows.
export function applyExpenseOps(queue, expenses) {
  if (!queue || queue.length === 0) return expenses;
  let result = expenses;
  for (const op of queue) {
    if (op.type === 'upsert') {
      result = [op.expense, ...result.filter((e) => e.id !== op.expense.id)];
    } else if (op.type === 'delete') {
      result = result.filter((e) => e.id !== op.id);
    } else if (op.type === 'replace') {
      result = op.expenses;
    }
  }
  return result;
}

export function applyIncomeOps(queue, income) {
  if (!queue || queue.length === 0) return income;
  let result = income;
  for (const op of queue) {
    if (op.type === 'upsert') {
      result = [op.income, ...result.filter((e) => e.id !== op.income.id)];
    } else if (op.type === 'delete') {
      result = result.filter((e) => e.id !== op.id);
    } else if (op.type === 'replace') {
      result = op.incomes;
    }
  }
  return result;
}

export function applyPendingOps(userId, expenses) {
  return applyExpenseOps(queues.get(userId), expenses);
}

export function applyPendingIncomeOps(userId, income) {
  return applyIncomeOps(queues.get(incomeKey(userId)), income);
}

// Full sync: push what we owe (both lanes), then pull the server's truth.
// Returns { expenses, settings, income } on success (settings is null when the
// server has no row and none is queued; income is null when its pull errors,
// e.g. the table isn't created yet — the cached income then stands), or null
// when sync isn't possible — the cached local state simply stands in that case.
export async function syncWithServer(userId) {
  if (!canSync(userId)) return null;
  await ensureQueueLoaded(userId);
  await ensureQueueLoaded(incomeKey(userId));
  try {
    await flush(userId);
    await flushIncome(userId);
    const [expensesRes, settingsRes, incomeRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, amount, currency, note, category, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('settings').select('display_currency, monthly_budget').maybeSingle(),
      supabase
        .from('income')
        .select('id, amount, currency, source, note, created_at')
        .order('created_at', { ascending: false }),
    ]);
    if (expensesRes.error || settingsRes.error) return null;

    // If a settings push is still queued (flush stopped early), the local
    // value is newer than the server's — prefer it.
    const queue = queues.get(userId) ?? [];
    const queuedSettings = [...queue].reverse().find((op) => op.type === 'settings');
    let settings = null;
    if (queuedSettings) {
      settings = {
        displayCurrency: queuedSettings.settings.displayCurrency,
        monthlyBudget: queuedSettings.settings.monthlyBudget,
      };
    } else if (settingsRes.data) {
      settings = {
        displayCurrency: settingsRes.data.display_currency || DEFAULT_SETTINGS.displayCurrency,
        monthlyBudget: Number(settingsRes.data.monthly_budget) || 0,
      };
    }

    // Income pull is tolerant: a missing table or any error leaves income null
    // so the expense/settings sync still succeeds.
    const income =
      !incomeRes.error && Array.isArray(incomeRes.data) ? incomeRes.data.map(fromIncomeRow) : null;

    return { expenses: expensesRes.data.map(fromRow), settings, income };
  } catch {
    return null; // offline — cache and queue carry on
  }
}
