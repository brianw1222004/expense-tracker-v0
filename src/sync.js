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

function groupsKey(userId) {
  return `${userId}::groups`;
}

function splitsKey(userId) {
  return `${userId}::splits`;
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

export function coalesceGroups(queue, op) {
  const keep = (existing) => {
    if (op.type === 'replace') return false;
    if (existing.type !== 'upsert') return true;
    if (op.type === 'upsert') return existing.group.id !== op.group.id;
    if (op.type === 'delete') return existing.group.id !== op.id;
    return true;
  };
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!keep(queue[i])) queue.splice(i, 1);
  }
}

export function coalesceSplits(queue, op) {
  const keep = (existing) => {
    if (op.type === 'replace') return false;
    if (existing.type !== 'upsert') return true;
    if (op.type === 'upsert') return existing.split.id !== op.split.id;
    if (op.type === 'delete') return existing.split.id !== op.id;
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

// Only the server-synced settings fields ride the queue — theme/language/
// onboardingDone are per-device preferences and never leave the device.
export function pickSyncedSettings(settings) {
  return {
    displayCurrency: settings.displayCurrency,
    monthlyBudget: settings.monthlyBudget,
    categoryBudgets: settings.categoryBudgets ?? {},
    categoryOrder: settings.categoryOrder ?? null,
    customCategories: settings.customCategories ?? [],
    customPaymentMethods: settings.customPaymentMethods ?? [],
    firstName: settings.firstName ?? '',
    lastName: settings.lastName ?? '',
  };
}

export function enqueueSettingsPush(userId, settings) {
  return enqueue(userId, { type: 'settings', settings: pickSyncedSettings(settings) });
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

async function enqueueGroup(userId, op) {
  if (!canSync(userId)) return;
  const key = groupsKey(userId);
  const queue = await ensureQueueLoaded(key);
  coalesceGroups(queue, op);
  queue.push(op);
  await persistQueue(key);
  flushGroups(userId);
}

async function enqueueSplit(userId, op) {
  if (!canSync(userId)) return;
  const key = splitsKey(userId);
  const queue = await ensureQueueLoaded(key);
  coalesceSplits(queue, op);
  queue.push(op);
  await persistQueue(key);
  flushSplits(userId);
}

export function enqueueGroupUpsert(userId, group) {
  return enqueueGroup(userId, { type: 'upsert', group });
}

export function enqueueGroupDelete(userId, id) {
  return enqueueGroup(userId, { type: 'delete', id });
}

export function enqueueGroupsReplace(userId, groups) {
  return enqueueGroup(userId, { type: 'replace', groups });
}

export function enqueueSplitUpsert(userId, split) {
  return enqueueSplit(userId, { type: 'upsert', split });
}

export function enqueueSplitDelete(userId, id) {
  return enqueueSplit(userId, { type: 'delete', id });
}

export function enqueueSplitsReplace(userId, splits) {
  return enqueueSplit(userId, { type: 'replace', splits });
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

function toSettingsRow(settings) {
  return {
    display_currency: settings.displayCurrency,
    monthly_budget: settings.monthlyBudget,
    category_budgets: settings.categoryBudgets ?? {},
    category_order: settings.categoryOrder ?? null,
    custom_categories: settings.customCategories ?? [],
    custom_payment_methods: settings.customPaymentMethods ?? [],
    first_name: settings.firstName ?? '',
    last_name: settings.lastName ?? '',
  };
}

// The extra settings columns are nullable and default NULL; NULL (or a missing
// column on a pre-migration database) means "no device has pushed this field
// yet", so it's omitted here and App.js's merge-over-local keeps the device's
// value. category_order NULL is ambiguous (never-pushed vs. spend-sorted) —
// resolved in favor of keeping the local order.
export function fromSettingsRow(row) {
  const settings = {
    displayCurrency: row.display_currency || DEFAULT_SETTINGS.displayCurrency,
    monthlyBudget: Number(row.monthly_budget) || 0,
  };
  if (row.category_budgets != null && typeof row.category_budgets === 'object') {
    settings.categoryBudgets = row.category_budgets;
  }
  if (Array.isArray(row.category_order)) settings.categoryOrder = row.category_order;
  if (Array.isArray(row.custom_categories)) settings.customCategories = row.custom_categories;
  if (Array.isArray(row.custom_payment_methods)) {
    settings.customPaymentMethods = row.custom_payment_methods;
  }
  if (row.first_name != null) settings.firstName = row.first_name;
  if (row.last_name != null) settings.lastName = row.last_name;
  return settings;
}

function toGroupRow(group) {
  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    payment_method: group.paymentMethod ?? 'cash',
    members: group.members ?? [],
    created_at: group.createdAt,
  };
}

function fromGroupRow(row) {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency || DEFAULT_CURRENCY,
    paymentMethod: row.payment_method || 'cash',
    members: Array.isArray(row.members) ? row.members : [],
    createdAt: Number(row.created_at),
  };
}

function toSplitRow(split) {
  return {
    id: split.id,
    group_id: split.groupId,
    description: split.description ?? '',
    amount: split.amount,
    currency: split.currency,
    category: split.category ?? 'other',
    paid_by: split.paidBy ?? '',
    mode: split.mode ?? 'equal',
    shares: split.shares ?? {},
    settlement: split.settlement ?? false,
    from_member: split.from ?? '',
    to_member: split.to ?? '',
    created_at: split.createdAt,
  };
}

function fromSplitRow(row) {
  const base = {
    id: row.id,
    groupId: row.group_id,
    amount: Number(row.amount),
    currency: row.currency || DEFAULT_CURRENCY,
    createdAt: Number(row.created_at),
  };
  if (row.settlement) {
    return {
      ...base,
      settlement: true,
      from: row.from_member,
      to: row.to_member,
    };
  }
  return {
    ...base,
    description: row.description ?? '',
    category: row.category || 'other',
    paidBy: row.paid_by,
    mode: row.mode || 'equal',
    shares: typeof row.shares === 'object' && row.shares !== null ? row.shares : {},
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
      // Invariant: ids must contain no commas or quote characters — this
      // string-interpolated PostgREST filter would silently corrupt otherwise.
      // True today because generateCategoryId / Date.now().toString(36) ids are
      // alphanumeric only; if the id charset ever changes, switch to a parameterised
      // filter instead of building the list by hand.
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
    const { error } = await supabase.from('settings').upsert(toSettingsRow(op.settings));
    if (error) {
      // A database created before the extra settings columns rejects the full
      // row with an unknown-column error (PGRST204). Fall back to the original
      // two-column payload so an unmigrated server can't wedge this lane —
      // expense ops queue behind settings ops.
      const unknownColumn = error.code === 'PGRST204' || /column/i.test(error.message ?? '');
      if (!unknownColumn) throw error;
      const legacy = await supabase.from('settings').upsert({
        display_currency: op.settings.displayCurrency,
        monthly_budget: op.settings.monthlyBudget,
      });
      if (legacy.error) throw legacy.error;
    }
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

async function runGroupOp(op, userId) {
  if (op.type === 'upsert') {
    const { error } = await supabase.from('groups').upsert(toGroupRow(op.group));
    if (error) throw error;
  } else if (op.type === 'delete') {
    const { error } = await supabase.from('groups').delete().eq('id', op.id).eq('user_id', userId);
    if (error) throw error;
  } else if (op.type === 'replace') {
    if (op.groups.length > 0) {
      const rows = op.groups.map(toGroupRow);
      const inserted = await supabase.from('groups').upsert(rows);
      if (inserted.error) throw inserted.error;
      const keepIds = rows.map((r) => `"${r.id}"`).join(',');
      const cleared = await supabase
        .from('groups')
        .delete()
        .eq('user_id', userId)
        .not('id', 'in', `(${keepIds})`);
      if (cleared.error) throw cleared.error;
    } else {
      const cleared = await supabase.from('groups').delete().eq('user_id', userId);
      if (cleared.error) throw cleared.error;
    }
  }
}

async function runSplitOp(op, userId) {
  if (op.type === 'upsert') {
    const { error } = await supabase.from('split_expenses').upsert(toSplitRow(op.split));
    if (error) throw error;
  } else if (op.type === 'delete') {
    const { error } = await supabase.from('split_expenses').delete().eq('id', op.id).eq('user_id', userId);
    if (error) throw error;
  } else if (op.type === 'replace') {
    if (op.splits.length > 0) {
      const rows = op.splits.map(toSplitRow);
      const inserted = await supabase.from('split_expenses').upsert(rows);
      if (inserted.error) throw inserted.error;
      const keepIds = rows.map((r) => `"${r.id}"`).join(',');
      const cleared = await supabase
        .from('split_expenses')
        .delete()
        .eq('user_id', userId)
        .not('id', 'in', `(${keepIds})`);
      if (cleared.error) throw cleared.error;
    } else {
      const cleared = await supabase.from('split_expenses').delete().eq('user_id', userId);
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

export function flushGroups(userId) {
  return flushQueue(groupsKey(userId), userId, runGroupOp);
}

export function flushSplits(userId) {
  return flushQueue(splitsKey(userId), userId, runSplitOp);
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

export function applyGroupOps(queue, groups) {
  if (!queue || queue.length === 0) return groups;
  let result = groups;
  for (const op of queue) {
    if (op.type === 'upsert') {
      result = [op.group, ...result.filter((g) => g.id !== op.group.id)];
    } else if (op.type === 'delete') {
      result = result.filter((g) => g.id !== op.id);
    } else if (op.type === 'replace') {
      result = op.groups;
    }
  }
  return result;
}

export function applySplitOps(queue, splits) {
  if (!queue || queue.length === 0) return splits;
  let result = splits;
  for (const op of queue) {
    if (op.type === 'upsert') {
      result = [op.split, ...result.filter((s) => s.id !== op.split.id)];
    } else if (op.type === 'delete') {
      result = result.filter((s) => s.id !== op.id);
    } else if (op.type === 'replace') {
      result = op.splits;
    }
  }
  return result;
}

export function applyPendingGroupOps(userId, groups) {
  return applyGroupOps(queues.get(groupsKey(userId)), groups);
}

export function applyPendingSplitOps(userId, splits) {
  return applySplitOps(queues.get(splitsKey(userId)), splits);
}

// Full sync: push what we owe (all lanes), then pull the server's truth.
// Returns { expenses, settings, income, groups, splits } on success (settings
// is null when the server has no row and none is queued; income/groups/splits
// are null when their pull errors, e.g. the table isn't created yet — the
// cached data then stands), or null when sync isn't possible.
export async function syncWithServer(userId) {
  if (!canSync(userId)) return null;
  await ensureQueueLoaded(userId);
  await ensureQueueLoaded(incomeKey(userId));
  await ensureQueueLoaded(groupsKey(userId));
  await ensureQueueLoaded(splitsKey(userId));
  try {
    await flush(userId);
    await flushIncome(userId);
    await flushGroups(userId);
    await flushSplits(userId);
    const [expensesRes, settingsRes, incomeRes, groupsRes, splitsRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, amount, currency, note, category, created_at')
        .order('created_at', { ascending: false }),
      // `*` instead of a column list so the pull works with or without the
      // extra settings columns (see fromSettingsRow's NULL handling).
      supabase.from('settings').select('*').maybeSingle(),
      supabase
        .from('income')
        .select('id, amount, currency, source, note, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('groups')
        .select('id, name, currency, payment_method, members, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('split_expenses')
        .select('id, group_id, description, amount, currency, category, paid_by, mode, shares, settlement, from_member, to_member, created_at')
        .order('created_at', { ascending: false }),
    ]);
    if (expensesRes.error) return null;

    // Settings pull is tolerant: a missing settings table or column error leaves
    // settings null (the local cache stands) without aborting the expense/income/
    // groups/splits data that already pulled successfully.
    const queue = queues.get(userId) ?? [];
    const queuedSettings = [...queue].reverse().find((op) => op.type === 'settings');
    let settings = null;
    if (queuedSettings) {
      // If a settings push is still queued (flush stopped early), the local
      // value is newer than the server's — prefer it. The op already holds
      // exactly the synced subset (pickSyncedSettings).
      settings = { ...queuedSettings.settings };
    } else if (!settingsRes.error && settingsRes.data) {
      settings = fromSettingsRow(settingsRes.data);
    }

    // Tolerant pulls: a missing table or any error leaves the field null so
    // the expense/settings sync still succeeds and the local cache stands.
    const income =
      !incomeRes.error && Array.isArray(incomeRes.data) ? incomeRes.data.map(fromIncomeRow) : null;
    const groups =
      !groupsRes.error && Array.isArray(groupsRes.data) ? groupsRes.data.map(fromGroupRow) : null;
    const splits =
      !splitsRes.error && Array.isArray(splitsRes.data) ? splitsRes.data.map(fromSplitRow) : null;

    return { expenses: expensesRes.data.map(fromRow), settings, income, groups, splits };
  } catch {
    return null; // offline — cache and queue carry on
  }
}
