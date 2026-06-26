// Split-bills domain — groups, shared bills, and the balance math. Bills and
// groups SYNC to Supabase via two separate lanes (`groups` and `split_expenses`
// tables, queue keys `${userId}::groups` / `${userId}::splits`), tolerant pulls
// like income; the AsyncStorage cache is just the offline-first local copy. "you"
// (the YOU sentinel) is the implicit owner of every group; `members` are the
// OTHER people, stored as typed names — this is a personal ledger of who owes
// whom, Splitwise-style. Bill amounts live in the bill's ENTRY currency and are
// converted at display time, exactly like expenses.
import { convert, getCurrency } from './currency';

// The implicit participant id for the app's owner. Members never use this id.
export const YOU = 'you';

// Payment methods a group settles in. A FIXED set (mirrors incomeSources.js):
// display names come from i18n (`pay.<id>`); `label` is the English fallback.
export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'mobile', label: 'Mobile pay' },
  { id: 'other', label: 'Other' },
];

const FALLBACK_METHOD = PAYMENT_METHODS[0];

function parseCustomAmount(value) {
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  return Number(normalized) || 0;
}

// Unknown/stale method ids fall back to "cash" so old groups still render.
export function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? FALLBACK_METHOD;
}

export function getPaymentMethodLabel(id, t) {
  return t('pay.' + getPaymentMethod(id).id);
}

// Split `amount` among `participantIds` (which may include YOU), respecting the
// currency's decimal precision so the shares always sum back to `amount`.
//  - 'equal'  → divided evenly; the leftover smallest-units are handed to the
//               first ids one at a time (deterministic, no rounding drift).
//  - 'custom' → use `custom` ({ id: amount }); blank/missing ids become 0. When
//               the rounded customs already sum to the rounded bill amount, any
//               sub-unit residual from per-share rounding is folded into the LAST
//               participant so the persisted shares sum EXACTLY to the rounded
//               bill (mirrors the equal-path leftover handling). When they don't
//               sum (an invalid split the save gate rejects), they pass through
//               unchanged.
// Returns { [id]: shareAmount } in the bill's currency.
export function computeShares(amount, mode, participantIds, custom = {}, currency = 'USD') {
  const ids = participantIds.filter(Boolean);
  if (ids.length === 0) return {};
  const factor = 10 ** getCurrency(currency).decimals;
  const roundUnit = (n) => Math.round(n * factor) / factor;

  if (mode === 'custom') {
    const shares = {};
    for (const id of ids) shares[id] = roundUnit(parseCustomAmount(custom[id]));
    // Reconcile so the rounded shares sum exactly to the rounded bill amount,
    // but only when they're already meant to (a sub-unit residual ≤ one smallest
    // unit, the same tolerance customSharesValid accepts) — that residual goes to
    // the last participant. An off-by-real-money split (which the save gate
    // rejects) passes through unchanged. Done in integer smallest-units to avoid
    // reintroducing float drift.
    const billUnits = Math.round(amount * factor);
    const shareUnits = ids.reduce((s, id) => s + Math.round(shares[id] * factor), 0);
    const residual = billUnits - shareUnits;
    if (residual !== 0 && Math.abs(residual) <= 1) {
      const lastId = ids[ids.length - 1];
      shares[lastId] = (Math.round(shares[lastId] * factor) + residual) / factor;
    }
    return shares;
  }

  const units = Math.round(amount * factor);
  const base = Math.floor(units / ids.length);
  let remainder = units - base * ids.length;
  const shares = {};
  for (const id of ids) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    shares[id] = (base + extra) / factor;
  }
  return shares;
}

// Whether a custom split's per-person amounts sum to the total (within one
// smallest unit). Validates the ROUNDED shares against the ROUNDED bill amount
// (the same basis computeShares and the persisted bill use) so the gate, the
// displayed total, and the persisted shares can never disagree.
export function customSharesValid(amount, custom, participantIds, currency = 'USD') {
  const decimals = getCurrency(currency).decimals;
  const factor = 10 ** decimals;
  const roundUnit = (n) => Math.round(n * factor) / factor;
  const roundedAmount = Number(amount.toFixed(decimals));
  const sum = participantIds.reduce((s, id) => s + roundUnit(parseCustomAmount(custom[id])), 0);
  return Math.abs(sum - roundedAmount) < 1 / factor;
}

// The bills belonging to one group (helper so callers can pass the flat list).
export function billsForGroup(groupId, splitExpenses) {
  return splitExpenses.filter((b) => b.groupId === groupId);
}

// Per-member balance for one group, in the GROUP's currency. Positive = the
// member owes you; negative = you owe the member. Only debts that involve YOU
// are tracked (a personal ledger — member-to-member debts are out of scope).
export function groupBalances(group, splitExpenses) {
  const balances = {};
  for (const m of group.members) balances[m.id] = 0;
  const gc = group.currency;

  for (const bill of splitExpenses) {
    if (bill.groupId !== group.id) continue;

    // A settlement is a direct payment between you and a member.
    if (bill.settlement) {
      const amt = convert(bill.amount, bill.currency, gc);
      if (bill.from === YOU && balances[bill.to] !== undefined) balances[bill.to] += amt;
      else if (bill.to === YOU && balances[bill.from] !== undefined) balances[bill.from] -= amt;
      continue;
    }

    const shares = bill.shares || {};
    if (bill.paidBy === YOU) {
      // You fronted it: every other participant owes you their share.
      for (const [pid, share] of Object.entries(shares)) {
        if (pid === YOU) continue;
        if (balances[pid] !== undefined) balances[pid] += convert(share, bill.currency, gc);
      }
    } else if (balances[bill.paidBy] !== undefined) {
      // A member fronted it: you owe them your share (if you took part).
      const yourShare = shares[YOU] || 0;
      if (yourShare) balances[bill.paidBy] -= convert(yourShare, bill.currency, gc);
    }
  }
  // Round each balance to the group currency's precision. Accumulation above is
  // full-precision, but a settled group must read as exactly zero (not a sub-unit
  // float residual), and a settle-up amount must be exact in the group's currency.
  const factor = 10 ** getCurrency(gc).decimals;
  for (const id of Object.keys(balances)) {
    balances[id] = Math.round(balances[id] * factor) / factor;
  }
  return balances;
}

// Net balance for a group (sum of member balances) in the group's currency.
export function groupNet(group, splitExpenses) {
  return Object.values(groupBalances(group, splitExpenses)).reduce((s, v) => s + v, 0);
}

// Overall owed/owe across every group, in the display currency. `owed` = total
// others owe you; `owe` = total you owe others; `net` = owed - owe.
export function overallBalance(groups, splitExpenses, displayCurrency) {
  let owed = 0;
  let owe = 0;
  for (const g of groups) {
    const balances = groupBalances(g, splitExpenses);
    for (const v of Object.values(balances)) {
      const d = convert(v, g.currency, displayCurrency);
      if (d > 0) owed += d;
      else if (d < 0) owe += -d;
    }
  }
  return { owed, owe, net: owed - owe };
}

// Your share of each split bill, as expense-like items so the existing spending
// aggregates (dashboard stats, category totals, budgets) count it — the user
// chose "your share counts as spending". These are NOT real expenses: the id is
// namespaced `split:` and they never enter the Expenses list. Amount stays in
// the bill's entry currency; category carries through for the breakdown.
export function yourShareAsExpenses(splitExpenses) {
  const items = [];
  for (const bill of splitExpenses) {
    if (bill.settlement) continue;
    const yourShare = bill.shares?.[YOU] || 0;
    if (yourShare > 0) {
      items.push({
        id: 'split:' + bill.id,
        amount: yourShare,
        currency: bill.currency,
        category: bill.category || 'other',
        note: bill.description || '',
        createdAt: bill.createdAt,
        splitId: bill.id,
        groupId: bill.groupId,
      });
    }
  }
  return items;
}
