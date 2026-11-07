// Exercise the real screen, month controls, effects, and list filtering without
// a native renderer. Other screens and financial/storage services stay out.
let mockHooks, mockHookIndex, mockEffects, mockDirty;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  memo: (component) => component,
  useMemo: (fn) => fn(),
  useState: (initial) => {
    const index = mockHookIndex++;
    if (!(index in mockHooks)) mockHooks[index] = initial;
    return [mockHooks[index], (value) => {
      mockDirty ||= mockHooks[index] !== value;
      mockHooks[index] = value;
    }];
  },
  useRef: (initial) => {
    const index = mockHookIndex++;
    if (!(index in mockHooks)) mockHooks[index] = { current: initial };
    return mockHooks[index];
  },
  useEffect: (effect, deps) => {
    const index = mockHookIndex++;
    if (!mockHooks[index] || deps.some((value, i) => value !== mockHooks[index][i])) {
      mockEffects.push(effect);
      mockHooks[index] = deps;
    }
  },
}));
jest.mock('react/jsx-runtime', () => ({
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
}));
jest.mock('react-native', () => ({
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
  Text: 'Text', View: 'View', StyleSheet: { create: (styles) => styles },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('../i18n', () => {
  const i18n = jest.requireActual('../../__mocks__/i18n.js');
  return { ...i18n, useT: () => (key) => i18n.translate('en', key) };
});
jest.mock('../icons', () => ({ HIcon: 'Icon' }));
jest.mock('../components/EmptyState', () => 'EmptyState');
jest.mock('../components/ExpenseRow', () => 'ExpenseRow');
jest.mock('../components/HeaderGlow', () => 'HeaderGlow');
jest.mock('../components/TabBar', () => ({ TAB_BAR_HEIGHT: 64 }));
jest.mock('../useHistoricalFxPreview', () => () => ({ entries: {} }));

const ExpenseListScreen = require('../screens/ExpenseListScreen').default;
const { shiftBrowsingMonthKey } = require('../browsingMonth');
const { getAllCategories, getCategoryLabel } = require('../categories');
const { dateKey } = require('../format');

// Expand the real MonthSelector and FilterChip functions into native elements.
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object') return [];
  if (typeof node.type === 'function') return elements(node.type(node.props));
  return [node, ...elements(node.props.children)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? textOf(node.props.children) : String(node);
}
function mount(monthKey = '2026-06') {
  const row = (id, day, category = 'food') => ({
    id, rowKey: id, category, displayAmount: 10,
    createdAt: new Date(2026, 5, day, 12).getTime(), sourceType: 'personal',
  });
  const props = {
    monthKey, currentMonthKey: '2026-06', loaded: true, hasSpending: true,
    groups: [], categories: getAllCategories(), displayCurrency: 'USD',
    spendingSections: [
      { total: 20, data: [row('today-food', 15), row('today-bus', 15, 'transport')] },
      { total: 10, data: [row('yesterday', 14)] },
    ],
    onDelete: jest.fn(),
    onShiftMonth: jest.fn((delta) => { props.monthKey = shiftBrowsingMonthKey(props.monthKey, delta); }),
  };
  let tree;
  const render = () => {
    do {
      mockDirty = false;
      mockHookIndex = 0;
      mockEffects = [];
      tree = elements(ExpenseListScreen(props));
      mockEffects.forEach((effect) => effect());
    } while (mockDirty);
  };
  const button = (label) => tree.find((node) => node.type === 'Pressable' && textOf(node) === String(label));
  render();
  return {
    props, render, button,
    press: (label) => { expect(button(label)).toBeDefined(); button(label).props.onPress(); render(); },
    rows: () => tree.filter((node) => node.type === 'ExpenseRow').map((node) => node.props.expense.id),
    selectedDay: () => tree.find((node) => node.type === 'Pressable' &&
      node.props.accessibilityState?.selected && /^\d+$/.test(textOf(node))),
  };
}

beforeEach(() => {
  mockHooks = [];
  global.__DEV__ = false;
  jest.useFakeTimers().setSystemTime(new Date(2026, 5, 15, 12));
});
afterEach(() => {
  jest.useRealTimers();
  delete global.__DEV__;
});

it.each(['2026-05', '2025-12', '2027-01'])(
  'returns from %s to the local current month, selects today, and refreshes rows', (month) => {
    const screen = mount(month);
    expect(screen.rows()).toEqual([]);
    screen.press('Today');
    expect(screen.props.monthKey).toBe('2026-06');
    expect(textOf(screen.selectedDay())).toBe('15');
    expect(screen.rows()).toEqual(['today-food', 'today-bus']);
    expect(screen.button('Today')).toBeUndefined();
    expect(screen.props.onShiftMonth).toHaveBeenCalledTimes(1);
  }
);

it('selects today within the current month without shifting it', () => {
  const screen = mount();
  screen.press(14);
  expect(screen.rows()).toEqual(['yesterday']);
  expect(screen.button('Today').props.accessibilityRole).toBe('button');
  expect(screen.button('Today').props.style({ pressed: false })[0]).toMatchObject({
    minHeight: 44, minWidth: 44,
  });
  screen.press('Today');
  expect(textOf(screen.selectedDay())).toBe('15');
  expect(screen.rows()).toEqual(['today-food', 'today-bus']);
  expect(screen.props.onShiftMonth).not.toHaveBeenCalled();
});

it('hides Today only while today is selected and visible', () => {
  const screen = mount();
  expect(screen.button('Today')).toBeUndefined();
  screen.press(14);
  expect(screen.button('Today')).toBeDefined();
  screen.press(15);
  expect(screen.button('Today')).toBeUndefined();
  // Invoke the real MonthSelector's previous-month handler.
  const previous = screen.button('');
  previous.props.onPress();
  screen.render();
  expect(screen.props.monthKey).toBe('2026-05');
  expect(screen.button('Today')).toBeDefined();
});

it.each(['2026-06', '2026-05'])('preserves category selection and source data from %s', (month) => {
  const screen = mount(month);
  const before = JSON.stringify(screen.props.spendingSections);
  const food = getCategoryLabel(screen.props.categories.find((category) => category.id === 'food'), (key) => key);
  screen.press(food);
  if (month === '2026-06') screen.press(14);
  screen.press('Today');
  expect(screen.button(food).props.accessibilityState.selected).toBe(true);
  expect(screen.rows()).toEqual(['today-food']);
  expect(JSON.stringify(screen.props.spendingSections)).toBe(before);
  expect(screen.props.onDelete).not.toHaveBeenCalled();
});

it('reads the local date again when tapped after a month rollover', () => {
  const screen = mount('2026-05');
  jest.setSystemTime(new Date(2026, 6, 1, 0, 5));
  screen.props.currentMonthKey = '2026-07';
  screen.press('Today');
  expect(screen.props.monthKey).toBe('2026-07');
  expect(textOf(screen.selectedDay())).toBe('1');
  expect(screen.button('Today')).toBeUndefined();
});

it.each([0, 23])('uses local calendar fields near midnight (hour %i)', (hour) => {
  jest.setSystemTime(new Date(2026, 5, 15, hour, 30));
  const screen = mount('2026-05');
  screen.press('Today');
  expect(dateKey(Date.now())).toBe('2026-06-15');
  expect(textOf(screen.selectedDay())).toBe('15');
  expect(screen.rows()).toEqual(['today-food', 'today-bus']);
});
