// Small screen harness matching the existing Jest setup; native modal behavior
// still needs an iPhone smoke test. The real Sheet and CurrencyPicker render.
let mockHooks, mockHookIndex, mockEffects, mockDirty, mockLanguage;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: (fn) => fn(),
  useState: (initial) => {
    const index = mockHookIndex++;
    if (!(index in mockHooks)) mockHooks[index] = initial;
    return [mockHooks[index], (value) => {
      mockDirty ||= mockHooks[index] !== value;
      mockHooks[index] = value;
    }];
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
  Fragment: 'Fragment',
}));
jest.mock('react-native', () => ({
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
  Text: 'Text', View: 'View', StyleSheet: { create: (styles) => styles },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('../i18n', () => {
  const i18n = jest.requireActual('../i18n.js');
  return { ...i18n, useT: () => (key, vars) => i18n.translate(mockLanguage, key, vars), useLanguage: () => mockLanguage };
});
jest.mock('../icons', () => ({ HIcon: 'Icon' }));
jest.mock('../components/AddCategoryModal', () => 'AddCategoryModal');
jest.mock('../components/EmptyState', () => 'EmptyState');
jest.mock('../components/HeaderGlow', () => 'HeaderGlow');
jest.mock('../components/TabBar', () => ({ TAB_BAR_HEIGHT: 64 }));

const AccountScreen = require('../screens/AccountScreen').default;
const InsightScreen = require('../screens/InsightScreen').default;
const CurrencyPicker = require('../components/CurrencyPicker').default;
const { CURRENCIES } = require('../currency');
const { currenciesByFrequency } = require('../currencyOrder');
const { DEFAULT_SETTINGS } = require('../storage');
const { deriveViewData } = require('../derive');
const { formatMoney, formatMoneyShort } = require('../format');
const { translate } = require('../i18n.js');

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object') return [];
  // Category drag gestures are outside this setting's scope.
  if (typeof node.type === 'function' && node.type.name !== 'DraggableTileGrid') {
    return [node, ...elements(node.type(node.props))];
  }
  return [node, ...elements(node.props.children)];
}
const textOf = (node) => {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? textOf(node.props.children) : String(node);
};
function mountAccount(patch = {}) {
  const props = {
    visible: true, settingsLoaded: true, settings: { ...DEFAULT_SETTINGS },
    onClose: jest.fn(), onUpdateSettings: jest.fn(), ...patch,
  };
  let tree;
  const render = () => {
    do {
      mockDirty = false; mockHookIndex = 0; mockEffects = [];
      tree = elements(AccountScreen(props));
      mockEffects.forEach((effect) => effect());
    } while (mockDirty);
  };
  render();
  return {
    props, render,
    tree: () => tree,
    trigger: () => tree.find((node) => node.type === 'Pressable' &&
      node.props.accessibilityLabel === `${translate(mockLanguage, 'acct.displayCurrency')}: ${props.settings.displayCurrency}`),
    picker: () => tree.find((node) => node.type === CurrencyPicker),
    open() { this.trigger().props.onPress(); render(); },
  };
}
beforeEach(() => { mockHooks = []; mockLanguage = 'en'; });

it.each(['en', 'zh', 'es'])('shows the reporting setting and explanation in %s, including for a new user', (language) => {
  mockLanguage = language;
  const screen = mountAccount();
  const texts = screen.tree().filter((node) => node.type === 'Text').map(textOf);
  expect(texts).toContain(translate(language, 'acct.displayCurrency'));
  expect(texts).toContain(translate(language, 'acct.displayCurrencyNote'));
  expect(texts).toContain('USD');
  expect(screen.trigger().props.accessibilityRole).toBe('button');
  expect(screen.trigger().props.accessibilityHint).toBe(translate(language, 'acct.displayCurrencyNote'));
  expect(screen.trigger().props.style({ pressed: false })[1].minHeight).toBe(44);
});

it('presents all supported currencies inside the Account modal and outside its ScrollView', () => {
  const screen = mountAccount();
  screen.open();
  expect(screen.picker().props.visible).toBe(true);
  const [sheetModal, pickerModal] = screen.tree().filter((node) => node.type === 'Modal');
  expect(sheetModal.props.visible).toBe(true);
  expect(pickerModal.props.visible).toBe(true);
  expect(elements(sheetModal.props.children).some((node) => node.type === CurrencyPicker)).toBe(true);
  const settingsScroll = screen.tree().find((node) => node.type === 'ScrollView');
  expect(elements(settingsScroll.props.children).some((node) => node.type === CurrencyPicker)).toBe(false);
  const choices = elements(pickerModal).filter((node) => node.props.accessibilityRole === 'radio');
  expect(choices.map((node) => node.props.accessibilityLabel.split(' ')[0])).toEqual(CURRENCIES.map((entry) => entry.code));
  expect(choices.find((node) => node.props.accessibilityState.selected).props.accessibilityLabel).toMatch(/^USD /);
});

it('reorders the open picker without changing Display Currency, labels, or selection callbacks', () => {
  const screen = mountAccount();
  screen.open();
  const currencies = currenciesByFrequency([{ id: 'saved', currency: 'JPY' }]);
  screen.props.currencies = currencies;
  screen.render();
  const pickerModal = screen.tree().filter((node) => node.type === 'Modal')[1];
  const choices = elements(pickerModal).filter((node) => node.props.accessibilityRole === 'radio');
  expect(choices.map((node) => node.props.accessibilityLabel.split(' ')[0])).toEqual(currencies.map(({ code }) => code));
  expect(choices.find((node) => node.props.accessibilityState.selected).props.accessibilityLabel).toBe('USD US Dollar');
  expect(screen.picker().props.visible).toBe(true);
  expect(screen.props.onUpdateSettings).not.toHaveBeenCalled();
  choices[0].props.onPress(); screen.render();
  expect(screen.props.onUpdateSettings).toHaveBeenCalledWith({ displayCurrency: 'JPY' });
  expect(screen.picker().props.visible).toBe(false);
});

it('sends only the displayCurrency patch through the supplied settings callback and returns to Account', () => {
  const screen = mountAccount();
  screen.open();
  const choice = screen.tree().find((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'JPY Japanese Yen');
  choice.props.onPress();
  screen.render();
  expect(screen.props.onUpdateSettings).toHaveBeenCalledTimes(1);
  expect(screen.props.onUpdateSettings).toHaveBeenCalledWith({ displayCurrency: 'JPY' });
  expect(screen.picker().props.visible).toBe(false);
  expect(screen.tree().find((node) => node.type === 'Modal').props.visible).toBe(true);
  expect(screen.props.onClose).not.toHaveBeenCalled();
  // App owns the value; the row and picker follow its updated settings prop.
  screen.props.settings = { ...screen.props.settings, displayCurrency: 'JPY' };
  screen.render();
  expect(screen.trigger()).toBeDefined();
  expect(screen.picker().props.value).toBe('JPY');
});

it.each(['backdrop', 'close', 'back'])('dismisses the picker via %s without changing settings or closing Account', (method) => {
  const screen = mountAccount();
  screen.open();
  const pickerModal = screen.tree().filter((node) => node.type === 'Modal')[1];
  const controls = elements(pickerModal);
  if (method === 'back') pickerModal.props.onRequestClose();
  else if (method === 'close') controls.find((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Close').props.onPress();
  else controls.find((node) => node.type === 'Pressable' && !node.props.accessibilityRole).props.onPress();
  screen.render();
  expect(screen.picker().props.visible).toBe(false);
  expect(screen.props.onUpdateSettings).not.toHaveBeenCalled();
  expect(screen.props.onClose).not.toHaveBeenCalled();
});

it('clears picker state when Account closes, so reopening shows the settings sheet', () => {
  const screen = mountAccount();
  screen.open();
  screen.props.visible = false; screen.render();
  expect(screen.picker().props.visible).toBe(false);
  screen.picker().props.onSelect('EUR');
  expect(screen.props.onUpdateSettings).not.toHaveBeenCalled();
  screen.props.visible = true; screen.render();
  expect(screen.picker().props.visible).toBe(false);
});

it.each([{ settingsLoaded: false }, { interactionLocked: true }, { deletingData: true }])(
  'blocks currency interaction while unavailable: %j', (patch) => {
    const screen = mountAccount();
    screen.open();
    Object.assign(screen.props, patch); screen.render();
    expect(screen.trigger().props.disabled).toBe(true);
    expect(screen.trigger().props.accessibilityState.disabled).toBe(true);
    expect(screen.picker().props.visible).toBe(false);
    screen.trigger().props.onPress();
    screen.picker().props.onSelect('EUR');
    screen.render();
    expect(screen.props.onUpdateSettings).not.toHaveBeenCalled();
    expect(screen.picker().props.visible).toBe(false);
  }
);

it.each(['USD', 'JPY'])('keeps Insight reporting in %s without an interactive currency control', (displayCurrency) => {
  const expenses = [{ id: 'e', amount: 10, currency: 'USD', category: 'food', createdAt: new Date(2026, 5, 15, 12).getTime() }];
  const original = JSON.stringify(expenses);
  const { months } = deriveViewData(expenses, displayCurrency, 'en');
  const budget = displayCurrency === 'USD' ? 100 : 15750;
  const editBudgets = jest.fn();
  mockHookIndex = 0; mockEffects = [];
  const tree = elements(InsightScreen({
    loaded: true, hasExpenses: true, displayCurrency, monthlyBudget: budget,
    categoryBudgets: {}, regularCategories: [{ id: 'food' }], externalCategories: [], months,
    monthKey: '2026-06', currentMonthKey: '2026-06', onEditBudgets: editBudgets,
  }));
  expect(tree.some((node) => node.type === CurrencyPicker)).toBe(false);
  expect(tree.some((node) => node.props.accessibilityLabel === 'Choose currency')).toBe(false);
  const categoryModal = tree.find((node) => node.type === 'AddCategoryModal');
  expect(categoryModal.props.displayCurrency).toBe(displayCurrency);
  expect(months[0].total).toBe(displayCurrency === 'USD' ? 10 : 1575);
  const texts = tree.filter((node) => node.type === 'Text').map(textOf);
  expect(texts).toContain(formatMoney(budget - months[0].total, displayCurrency));
  expect(texts).toContain(formatMoneyShort(months[0].total, displayCurrency));
  const editButton = tree.find((node) => node.type === 'Pressable' && textOf(node) === 'Edit budgets');
  expect(editButton).toBeDefined();
  editButton.props.onPress();
  expect(editBudgets).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(expenses)).toBe(original);
});
