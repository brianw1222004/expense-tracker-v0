import { dateKey } from './format';
import { getCategory } from './categories';

// Calendar markers use the same unified sections as the day list.
export function spendingDays(sections, monthKey) {
  const days = new Set();
  for (const section of sections) {
    if (!section.data.length) continue;
    const key = dateKey(section.data[0].createdAt);
    if (key.startsWith(monthKey)) days.add(Number(key.slice(8)));
  }
  return days;
}

export function spendingForDay(sections, selectedDate, categoryId = 'all', categories = []) {
  const section = sections.find(
    (day) => day.data.length && dateKey(day.data[0].createdAt) === selectedDate
  );
  const filteredExpenses = !section ? [] : categoryId === 'all' ? section.data : section.data.filter(
    (item) => getCategory(item.category, categories).id === categoryId
  );
  // With no filter, keep the exact accumulation used by the daily chart,
  // including its floating-point order, rather than summing the sorted rows.
  const filteredTotal = categoryId === 'all'
    ? section?.total ?? 0
    : filteredExpenses.reduce((sum, item) => sum + item.displayAmount, 0);
  return { filteredExpenses, filteredTotal };
}

export function canDeleteSpendingActivity(activity) {
  return activity?.sourceType === 'personal';
}

// Resolve from current source collections at tap time. Synthetic records never
// enter either editor; stale/missing bills and groups safely produce no target.
export function resolveSpendingEdit(activity, expenses, splitExpenses, groups) {
  if (activity?.sourceType === 'personal') {
    const record = expenses.find((expense) => expense.id === activity.id);
    return record ? { sourceType: 'personal', record } : null;
  }
  if (activity?.sourceType === 'shared') {
    const record = splitExpenses.find((bill) => bill.id === activity.splitId);
    if (!record || record.settlement || record.groupId !== activity.groupId) return null;
    if (!groups.some((group) => group.id === record.groupId)) return null;
    return { sourceType: 'shared', record };
  }
  return null;
}

// Props used directly by ExpenseRow so tests exercise the actual available
// gestures and accessibility hints without requiring a native renderer.
export function spendingRowInteractions(activity, { onEdit, onRequestDelete }) {
  const canDelete = canDeleteSpendingActivity(activity) && !!onRequestDelete;
  return {
    onPress: () => onEdit(activity),
    onLongPress: canDelete ? () => onRequestDelete(activity) : undefined,
    accessibilityHintKey: activity.sourceType === 'shared'
      ? 'list.editSharedBill'
      : canDelete ? 'list.longPressToDelete' : undefined,
  };
}
