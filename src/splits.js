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

// Minimal hugeicon glyphs a group can pick (chosen from the icon-picker page).
// Stored as an icon-key string in `group.icon` (rendered via HIcon), the same
// posture as a payment method's `icon`; DEFAULT_GROUP_ICON when unset. Every key
// must be registered in icons.js. Curated for common shared-expense scenarios.
export const GROUP_ICONS = [
  'user-group', 'user-multiple', 'favourite', 'home-01',
  'airplane-01', 'car-01', 'beach-02', 'mountain',
  'restaurant-01', 'coffee-01', 'bottle-wine', 'birthday-cake',
  'gift', 'shopping-bag-01', 'football', 'game-controller-01',
  'music-note-01', 'briefcase-01', 'graduation-cap', 'building-01',
];
export const DEFAULT_GROUP_ICON = 'user-group';

// Normalize a stored group icon to a known key, falling back to the default —
// so legacy caches (which held emoji strings before this was a hugeicon key)
// render as the default group glyph instead of HIcon's generic grid fallback.
export function getGroupIcon(icon) {
  return GROUP_ICONS.includes(icon) ? icon : DEFAULT_GROUP_ICON;
}

// Payment methods a group settles in. Built-ins are a FIXED set; users can also
// add custom ones (stored device-local in settings.customPaymentMethods). Each
// method — like a category — carries a `color` and a hugeicon `icon`, used to
// render an icon+color chip and to theme a group's surface by its payment
// method. Display names come from i18n (`pay.<id>`); `label` is the English
// fallback. Custom methods use their raw `label` (no i18n).
export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', color: '#4F9D8F', icon: 'cash-01' },
  { id: 'card', label: 'Card', color: '#5B7FC4', icon: 'credit-card' },
  { id: 'bank', label: 'Bank transfer', color: '#9B7FC0', icon: 'bank' },
  { id: 'mobile', label: 'Mobile pay', color: '#C28A4E', icon: 'smart-phone-01' },
  { id: 'other', label: 'Other', color: '#8A9AA8', icon: 'wallet-01' },
];

// Defaults for legacy custom methods cached before color/icon existed, and for
// the unknown-id fallback, so every caller can always read a color/icon.
export const DEFAULT_METHOD_COLOR = '#8A9AA8';
export const DEFAULT_METHOD_ICON = 'wallet-01';

// Curated hugeicon set for the "add payment method" picker (all registered in
// icons.js — 14 fit one page, mirroring categories' EMOJI_OPTIONS).
export const PAYMENT_ICON_OPTIONS = [
  'cash-01', 'credit-card', 'bank', 'smart-phone-01', 'wallet-01',
  'coins-01', 'money-bag-01', 'banknote', 'dollar-circle', 'qr-code',
  'money-send-01', 'money-receive-01', 'gift', 'briefcase-01',
];

export function getAllPaymentMethods(customPaymentMethods = []) {
  return [...PAYMENT_METHODS, ...(Array.isArray(customPaymentMethods) ? customPaymentMethods : [])];
}

const FALLBACK_METHOD = PAYMENT_METHODS[0];

function parseCustomAmount(value) {
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  return Number(normalized) || 0;
}

// The merged method object (built-in OR custom) with color/icon GUARANTEED.
// Unknown/stale ids fall back to "cash". The customs arg is optional so existing
// single-arg callers (and the tests) keep working; legacy customs that lack
// color/icon get the defaults filled in.
export function getPaymentMethod(id, customPaymentMethods = []) {
  const found = getAllPaymentMethods(customPaymentMethods).find((m) => m.id === id);
  if (!found) return FALLBACK_METHOD;
  return { color: DEFAULT_METHOD_COLOR, icon: DEFAULT_METHOD_ICON, ...found };
}

// The themeable color for a payment-method id (built-in or custom).
export function getPaymentMethodColor(id, customPaymentMethods = []) {
  return getPaymentMethod(id, customPaymentMethods).color;
}

export function getPaymentMethodLabel(id, t, customPaymentMethods = []) {
  const builtIn = PAYMENT_METHODS.find((m) => m.id === id);
  if (builtIn) return t('pay.' + builtIn.id);
  const custom = (customPaymentMethods || []).find((m) => m.id === id);
  // Unknown/deleted id → fall back to "cash", matching getPaymentMethod/
  // getPaymentMethodColor (never echo the raw internal id into the UI).
  return custom ? custom.label : t('pay.' + FALLBACK_METHOD.id);
}

// Reconcile a set of floored integer shares so they sum EXACTLY to the intended
// total: hand out a positive `remainder` round-robin, or trim a negative one
// (never below zero). A negative remainder happens when percentages sum just
// over 100 (still within percentageSharesValid's tolerance) so the floored units
// already overshoot. Shared by the percentage and tax splits.
function distributeUnits(unitShares, remainder) {
  const n = unitShares.length;
  if (n === 0) return unitShares;
  let r = remainder;
  let i = 0;
  while (r > 0) {
    unitShares[i % n] += 1;
    r -= 1;
    i += 1;
  }
  // `skips` breaks out if there's nothing left to trim (all zero) — the sum
  // invariant guarantees enough positive units, so this is just a safety net.
  let skips = 0;
  while (r < 0 && skips < n) {
    const idx = i % n;
    if (unitShares[idx] > 0) {
      unitShares[idx] -= 1;
      r += 1;
      skips = 0;
    } else {
      skips += 1;
    }
    i += 1;
  }
  return unitShares;
}

// Split `amount` among `participantIds` (which may include YOU), respecting the
// currency's decimal precision so the shares always sum back to `amount`.
//  - 'equal'      → divided evenly; the leftover smallest-units are handed to the
//                   first ids one at a time (deterministic, no rounding drift).
//  - 'custom'     → use `custom` ({ id: amount }); blank/missing ids become 0. When
//                   the rounded customs already sum to the rounded bill amount, any
//                   sub-unit residual from per-share rounding is folded into the LAST
//                   participant so the persisted shares sum EXACTLY to the rounded
//                   bill (mirrors the equal-path leftover handling). When they don't
//                   sum (an invalid split the save gate rejects), they pass through
//                   unchanged.
//  - 'percentage' → `custom` holds each id's PERCENTAGE (summing to ~100); shares =
//                   amount * pct/100, floored to smallest units with the leftover
//                   units handed out round-robin so they sum to the rounded amount.
// Returns { [id]: shareAmount } in the bill's currency. (The 'tax' mode persists
// via computeTaxShares — it needs per-person subtotals + a tax/tip rate.)
export function computeShares(amount, mode, participantIds, custom = {}, currency = 'USD') {
  const ids = participantIds.filter(Boolean);
  if (ids.length === 0) return {};
  const factor = 10 ** getCurrency(currency).decimals;
  const roundUnit = (n) => Math.round(n * factor) / factor;

  if (mode === 'percentage') {
    const totalUnits = Math.round(amount * factor);
    const unitShares = ids.map((id) => Math.floor(((Number(custom[id]) || 0) / 100) * amount * factor));
    distributeUnits(unitShares, totalUnits - unitShares.reduce((s, u) => s + u, 0));
    const shares = {};
    ids.forEach((id, i) => { shares[id] = unitShares[i] / factor; });
    return shares;
  }

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

// Whether a percentage split's per-person percentages sum to ~100 (within half a
// percent, generous enough for "33.3" thirds). `percentages` is { id: pct }.
export function percentageSharesValid(percentages, participantIds) {
  const ids = participantIds.filter(Boolean);
  if (ids.length === 0) return false;
  const sum = ids.reduce((s, id) => s + (Number(percentages[id]) || 0), 0);
  return Math.abs(sum - 100) < 0.5;
}

// Itemized tax split: each participant types their own subtotal (what they
// ordered); a single tax % and optional tip % are added and distributed
// PROPORTIONALLY to each subtotal. Returns { total, shares } in `currency`, with
// the shares summing EXACTLY to the rounded grand total (leftover smallest-units
// handed out round-robin, mirroring computeShares). `subtotals` is { id: amount }.
export function computeTaxShares(subtotals, participantIds, taxPct = 0, tipPct = 0, currency = 'USD') {
  const ids = participantIds.filter(Boolean);
  if (ids.length === 0) return { total: 0, shares: {} };
  const factor = 10 ** getCurrency(currency).decimals;
  const mult = 1 + ((Number(taxPct) || 0) + (Number(tipPct) || 0)) / 100;
  const subtotalOf = (id) => Number(subtotals[id]) || 0;
  const totalUnits = Math.round(ids.reduce((s, id) => s + subtotalOf(id), 0) * mult * factor);
  const unitShares = ids.map((id) => Math.floor(subtotalOf(id) * mult * factor));
  distributeUnits(unitShares, totalUnits - unitShares.reduce((s, u) => s + u, 0));
  const shares = {};
  ids.forEach((id, i) => { shares[id] = unitShares[i] / factor; });
  return { total: totalUnits / factor, shares };
}

// Whether a tax split has something to split — at least one participant's
// subtotal is greater than zero. `subtotals` is { id: amount }.
export function taxInputValid(subtotals, participantIds) {
  const ids = participantIds.filter(Boolean);
  if (ids.length === 0) return false;
  return ids.reduce((s, id) => s + (Number(subtotals[id]) || 0), 0) > 0;
}

// The bills belonging to one group (helper so callers can pass the flat list).
export function billsForGroup(groupId, splitExpenses) {
  return splitExpenses.filter((b) => b.groupId === groupId);
}

// Rewrite a bill after a member is removed from its group.
//  - 'redistribute' → the member's share is re-split among the remaining
//    participants: equal-mode bills stay equal (recomputed over the remainder);
//    weighted modes scale the remaining shares up proportionally, falling back
//    to an equal re-split when the remainder held nothing. The result becomes a
//    plain 'custom' split unless it stayed 'equal'.
//  - 'unassign' → the member's share key is dropped, leaving the residual
//    (bill.amount - sum(shares)) undistributed for the user to reassign in the
//    bill editor (see billUndistributed); mode becomes 'custom' so the editor
//    opens on per-person amounts.
// Both strategies drop `meta` (raw percentage/tax inputs no longer describe the
// shares). Settlements and bills the member isn't part of return unchanged (===).
export function removeMemberFromBill(bill, memberId, strategy = 'unassign') {
  if (bill.settlement || !bill.shares || bill.shares[memberId] === undefined) return bill;
  const base = { ...bill };
  delete base.meta;
  const rest = { ...bill.shares };
  delete rest[memberId];
  const restIds = Object.keys(rest);

  if (strategy !== 'redistribute' || restIds.length === 0) {
    return { ...base, mode: 'custom', shares: rest };
  }
  if (bill.mode === 'equal') {
    return { ...base, mode: 'equal', shares: computeShares(bill.amount, 'equal', restIds, {}, bill.currency) };
  }
  const restSum = restIds.reduce((s, id) => s + (Number(rest[id]) || 0), 0);
  if (restSum <= 0) {
    // The removed member carried the whole bill — nothing to scale, re-split it.
    return { ...base, mode: 'custom', shares: computeShares(bill.amount, 'equal', restIds, {}, bill.currency) };
  }
  // Scale the remaining shares back up to the full amount, preserving their
  // relative weights — floored to smallest currency units with the leftover
  // handed out round-robin so they sum EXACTLY to the rounded bill amount.
  const factor = 10 ** getCurrency(bill.currency).decimals;
  const totalUnits = Math.round(bill.amount * factor);
  const unitShares = restIds.map((id) => Math.floor(((Number(rest[id]) || 0) / restSum) * bill.amount * factor));
  distributeUnits(unitShares, totalUnits - unitShares.reduce((s, u) => s + u, 0));
  const shares = {};
  restIds.forEach((id, i) => { shares[id] = unitShares[i] / factor; });
  return { ...base, mode: 'custom', shares };
}

// A bill's undistributed residual (amount minus the sum of its shares) in the
// bill's currency — nonzero after a member was removed with 'unassign', zero for
// settlements and fully-assigned bills. Sub-unit float noise rounds away.
export function billUndistributed(bill) {
  if (bill.settlement) return 0;
  const factor = 10 ** getCurrency(bill.currency).decimals;
  const sum = Object.values(bill.shares || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const residual = Math.round((bill.amount - sum) * factor) / factor;
  return residual > 0 ? residual : 0;
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
