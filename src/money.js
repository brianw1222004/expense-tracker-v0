// Financial projections: personal spending for reporting, and obligations for
// settlement/display. All valuations currently use the same static conversion;
// these boundaries add no rate storage, historical policy, or extra rounding.
import { convert, getCurrency } from './currency';

// The implicit participant id for the app's owner. Members never use this id.
export const YOU = 'you';

export function valueSpendingForReporting(item, reportingCurrency) {
  return convert(item.amount, item.currency, reportingCurrency);
}

// Convert at full precision; groupBalances rounds after all records accumulate.
export function valueObligationForSettlement(amount, sourceCurrency, settlementCurrency) {
  return convert(amount, sourceCurrency, settlementCurrency);
}

export function valueObligationForDisplay(amount, settlementCurrency, reportingCurrency) {
  return convert(amount, settlementCurrency, reportingCurrency);
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
      const amt = valueObligationForSettlement(bill.amount, bill.currency, gc);
      if (bill.from === YOU && balances[bill.to] !== undefined) balances[bill.to] += amt;
      else if (bill.to === YOU && balances[bill.from] !== undefined) balances[bill.from] -= amt;
      continue;
    }

    const shares = bill.shares || {};
    if (bill.paidBy === YOU) {
      // You fronted it: every other participant owes you their share.
      for (const [pid, share] of Object.entries(shares)) {
        if (pid === YOU) continue;
        if (balances[pid] !== undefined) balances[pid] += valueObligationForSettlement(share, bill.currency, gc);
      }
    } else if (balances[bill.paidBy] !== undefined) {
      // A member fronted it: you owe them your share (if you took part).
      const yourShare = shares[YOU] || 0;
      if (yourShare) balances[bill.paidBy] -= valueObligationForSettlement(yourShare, bill.currency, gc);
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
// `owedCount`/`oweCount` = how many people are behind each figure (a member in
// several groups counts once per group — each debt is per-group).
export function overallBalance(groups, splitExpenses, displayCurrency) {
  let owed = 0;
  let owe = 0;
  let owedCount = 0;
  let oweCount = 0;
  for (const g of groups) {
    const balances = groupBalances(g, splitExpenses);
    for (const v of Object.values(balances)) {
      const d = valueObligationForDisplay(v, g.currency, displayCurrency);
      if (d > 0) {
        owed += d;
        owedCount += 1;
      } else if (d < 0) {
        owe += -d;
        oweCount += 1;
      }
    }
  }
  return { owed, owe, net: owed - owe, owedCount, oweCount };
}

// Your share of each split bill, as expense-like items so the existing spending
// aggregates (dashboard stats, category totals, budgets) count it — the user
// chose "your share counts as spending". These are NOT real expenses: the id is
// namespaced `split:` and they never enter the Expenses list. Amount stays in
// the bill's entry currency; category carries through for the breakdown.
export function deriveSharedSpendingActivity(splitExpenses) {
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
