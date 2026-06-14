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
// wins, per expense row.
//
// Ops: { type: 'upsert', expense }   add/edit one expense
//      { type: 'delete', id }        remove one expense
//      { type: 'replace', expenses } replace the whole set (demo data)
//      { type: 'settings', settings } push the settings row

const QUEUE_KEY = '@expense-tracker/pending-ops';

// In-memory queues are the source of truth once loaded; AsyncStorage mirrors
// them so ops survive a restart. Keyed per user, like the cache.
const queues = new Map();
const queueLoads = new Map();
const flushes = new Map();

function canSync(userId) {
  return isSupabaseConfigured && Boolean(userId) && userId !== LOCAL_USER;
}

async function ensureQueueLoaded(userId) {
  if (queues.has(userId)) return queues.get(userId);
  if (!queueLoads.has(userId)) {
    queueLoads.set(
      userId,
      (async () => {
        let ops = [];
        try {
          const raw = await AsyncStorage.getItem(`${QUEUE_KEY}:${userId}`);
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) ops = parsed;
        } catch {
          // Corrupt/unreadable queue: start empty, same best-effort stance as
          // the cache. The server copy is intact either way.
        }
        if (!queues.has(userId)) queues.set(userId, ops);
        return queues.get(userId);
      })()
    );
  }
  return queueLoads.get(userId);
}

async function persistQueue(userId) {
  try {
    await AsyncStorage.setItem(`${QUEUE_KEY}:${userId}`, JSON.stringify(queues.get(userId) ?? []));
  } catch {
    // Best-effort: the in-memory queue still flushes this session.
  }
}

// Drop queued ops the incoming op makes redundant. Removal is by value here
// and by identity in flush(), so the two never fight over array indices.
function coalesce(queue, op) {
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

async function enqueue(userId, op) {
  if (!canSync(userId)) return;
  const queue = await ensureQueueLoaded(userId);
  coalesce(queue, op);
  queue.push(op);
  await persistQueue(userId);
  flush(userId); // fire-and-forget; failures stay queued for the next trigger
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

async function runOp(op) {
  if (op.type === 'upsert') {
    const { error } = await supabase.from('expenses').upsert(toRow(op.expense));
    if (error) throw error;
  } else if (op.type === 'delete') {
    const { error } = await supabase.from('expenses').delete().eq('id', op.id);
    if (error) throw error;
  } else if (op.type === 'replace') {
    // RLS scopes the delete to this user's rows; the filter is just PostgREST's
    // required "no unfiltered delete" guard.
    const cleared = await supabase.from('expenses').delete().gte('created_at', 0);
    if (cleared.error) throw cleared.error;
    if (op.expenses.length > 0) {
      const inserted = await supabase.from('expenses').upsert(op.expenses.map(toRow));
      if (inserted.error) throw inserted.error;
    }
  } else if (op.type === 'settings') {
    const { error } = await supabase.from('settings').upsert({
      display_currency: op.settings.displayCurrency,
      monthly_budget: op.settings.monthlyBudget,
    });
    if (error) throw error;
  }
}

// Push pending ops in order, stopping at the first failure (offline, expired
// session) — the rest stay queued. Single-flight per user; ops enqueued while
// a flush is running are picked up by the same loop.
export function flush(userId) {
  if (!canSync(userId)) return Promise.resolve(false);
  if (flushes.has(userId)) return flushes.get(userId);
  const run = (async () => {
    const queue = await ensureQueueLoaded(userId);
    while (queue.length > 0) {
      const op = queue[0];
      try {
        await runOp(op);
      } catch {
        return false;
      }
      const index = queue.indexOf(op);
      if (index !== -1) queue.splice(index, 1);
      await persistQueue(userId);
    }
    return true;
  })().finally(() => flushes.delete(userId));
  flushes.set(userId, run);
  return run;
}

// Re-apply pending ops on top of server state (synchronous, in-memory queue).
// Called by App.js at setState time so a mutation made while a pull was in
// flight still shows up in the merged result.
export function applyPendingOps(userId, expenses) {
  const queue = queues.get(userId);
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

// Full sync: push what we owe, then pull the server's truth. Returns
// { expenses, settings } on success (settings is null when the server has no
// row and none is queued), or null when sync isn't possible — the cached
// local state simply stands in that case.
export async function syncWithServer(userId) {
  if (!canSync(userId)) return null;
  await ensureQueueLoaded(userId);
  try {
    await flush(userId);
    const [expensesRes, settingsRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, amount, currency, note, category, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('settings').select('display_currency, monthly_budget').maybeSingle(),
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
    return { expenses: expensesRes.data.map(fromRow), settings };
  } catch {
    return null; // offline — cache and queue carry on
  }
}
