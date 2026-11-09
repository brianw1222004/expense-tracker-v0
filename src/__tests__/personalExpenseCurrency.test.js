// Exercise the actual App callbacks and personal form with the repository's
// lightweight hook harness. Unrelated screens and native animation are stubs.
let mockFrame, mockFrames, mockAuthListener;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: (fn) => fn(),
  useState: (initial) => {
    const frame = mockFrame, index = frame.index++;
    if (!(index in frame.hooks)) frame.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [frame.hooks[index].value, (value) => {
      const next = typeof value === 'function' ? value(frame.hooks[index].value) : value;
      frame.dirty ||= next !== frame.hooks[index].value;
      frame.hooks[index].value = next;
    }];
  },
  useRef: (initial) => {
    const frame = mockFrame, index = frame.index++;
    if (!(index in frame.hooks)) frame.hooks[index] = { current: initial };
    return frame.hooks[index];
  },
  useEffect: (effect, deps) => {
    const frame = mockFrame, index = frame.index++;
    const previous = frame.hooks[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      frame.effects.push(() => {
        previous?.cleanup?.();
        frame.hooks[index] = { deps, cleanup: effect() };
      });
    }
  },
}));
jest.mock('react/jsx-runtime', () => ({
  jsx: (type, props, key) => ({ type, props, key }),
  jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'Fragment',
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (values) => values.web ?? values.default },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AccessibilityInfo: { announceForAccessibility: jest.fn() },
  Animated: {
    View: 'AnimatedView',
    Value: class { setValue() {} interpolate() { return 0; } },
    timing: () => ({ start: () => {} }),
  },
  Keyboard: { dismiss: jest.fn() }, useWindowDimensions: () => ({ width: 393, height: 852 }),
  Pressable: 'Pressable', View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles) => styles },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 0 }),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect' }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: async () => {}, hideAsync: async () => {} }));
jest.mock('expo-haptics', () => ({ NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock('../../assets/fonts/Arimo-Medium.ttf', () => 1);
jest.mock('../../assets/fonts/LiberationSans-Bold.ttf', () => 2);
jest.mock('../icons', () => ({ HIcon: 'Icon' }));
jest.mock('../confirm', () => ({ ...jest.requireActual('../confirm'), alertInfo: jest.fn(async () => {}) }));
jest.mock('../i18n', () => jest.requireActual('../i18n.js'));
jest.mock('../fxRateService', () => ({
  ...jest.requireActual('../fxRateService'),
  getHistoricalFxRate: jest.fn(async () => ({ status: 'unavailable' })),
}));
jest.mock('../useTabSlide', () => () => ({ tab: 'list', changeTab: jest.fn(), screenStyle: () => ({}), swipeHandlers: {} }));
jest.mock('../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: async () => ({ data: { session: { user: { id: 'alice' } } } }),
    onAuthStateChange: (listener) => { mockAuthListener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
  } },
}));
jest.mock('../sync', () => ({
  ...jest.requireActual('../sync'),
  syncWithServer: jest.fn(async () => null),
  enqueueExpenseUpsert: jest.fn(async () => {}), enqueueSettingsPush: jest.fn(),
}));
jest.mock('../components/CalendarField', () => ({
  ...jest.requireActual('../components/CalendarField'), __esModule: true, default: 'CalendarField',
}));
// Keep these components opaque when traversing App's element tree.
for (const name of ['DashboardScreen', 'AddEntryScreen', 'ExpenseListScreen', 'AccountScreen', 'InsightScreen',
  'SplitBillsScreen', 'GroupDetailScreen', 'CreateGroupScreen', 'SharedSplitForm', 'BudgetScreen', 'AuthScreen', 'OnboardingScreen']) {
  jest.doMock(`../screens/${name}`, () => name);
}
for (const name of ['TabBar', 'AddExpenseModal', 'ErrorBoundary', 'RewardCheck', 'HeaderGlow',
  'EntryModeToggle', 'CurrencyPill', 'CurrencyPicker']) {
  jest.doMock(`../components/${name}`, () => name);
}

const App = require('../../App').default;
const PersonalForm = jest.requireActual('../screens/AddEntryScreen').default;
const RealCurrencyPill = jest.requireActual('../components/CurrencyPill').default;
const SharedForm = jest.requireActual('../screens/SharedSplitForm').default;
const CreateGroup = jest.requireActual('../screens/CreateGroupScreen').default;
const GroupDetail = jest.requireActual('../screens/GroupDetailScreen').default;
const { CURRENCIES } = require('../currency');
const { currenciesByFrequency } = require('../currencyOrder');
const storage = require('../storage');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const sync = require('../sync');
const cloud = require('../supabase');
const { getAllCategories } = require('../categories');
const { translate } = require('../i18n.js');
const { alertInfo } = require('../confirm');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props.children)] : [];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? textOf(node.props.children) : String(node);
}
function renderer(component, props = {}) {
  const frame = { hooks: [], index: 0, effects: [], dirty: false, tree: null };
  mockFrames.push(frame);
  const render = (effects = true) => {
    do {
      mockFrame = frame; frame.index = 0; frame.effects = []; frame.dirty = false;
      frame.tree = component(props);
      if (effects) frame.effects.forEach((effect) => effect());
    } while (effects && frame.dirty);
  };
  render();
  return { props, render, tree: () => frame.tree, nodes: (type) => nodes(frame.tree).filter((node) => node.type === type) };
}
async function settle(app) {
  for (let i = 0; i < 4; i++) { await tick(); app.render(); }
}
async function mountApp() {
  const entry = renderer(App);
  const app = renderer(entry.tree().props.children.type);
  await settle(app);
  return app;
}
const settingsOf = (app) => app.nodes('AccountScreen')[0].props.settings;

it('enables the common FX reporting model with explicit Estimated fallback on all three screens', async () => {
  const rates = jest.spyOn(require('../fxRateService'), 'getHistoricalFxRate').mockResolvedValue({ status: 'unavailable' });
  try {
    await storage.saveExpenses('alice', [{ id: 'fx-boundary', amount: 20, currency: 'USD', category: 'food', createdAt: Date.now() }]);
    const app = await mountApp();
    const dashboard = app.nodes('DashboardScreen')[0].props;
    const list = app.nodes('ExpenseListScreen')[0].props;
    const insight = app.nodes('InsightScreen')[0].props;
    expect(dashboard.monthTotal).toBe(650);
    expect(insight.months[0].total).toBe(650);
    expect(list.spendingSections[0].data[0].displayAmount).toBe(650);
    expect(list.spendingSections[0].data[0].fx.status).toBe('estimated');
    for (const screen of [dashboard, list, insight]) {
      expect(screen.fxMode).toBe(true); expect(screen.fxReady).toBe(true);
      expect(screen).not.toHaveProperty('fxPreviewEnabled');
    }
    expect(dashboard.categoryMonths).toBe(insight.months);
    expect(dashboard.coverage).toBe(insight.months[0].coverage);
    expect(rates).toHaveBeenCalledTimes(1);
  } finally { rates.mockRestore(); }
});
const newForm = (app) => app.nodes('AddEntryScreen').find((node) => !node.props.editEntry);
function openNew(app) { app.nodes('TabBar')[0].props.onAdd(); app.render(); return newForm(app); }
const expense = (currency = 'USD', patch = {}) => ({ amount: 10, currency, note: '', category: 'food', ...patch });
function formRenderer(props = {}) {
  return renderer(PersonalForm, { displayCurrency: 'TWD', categories: getAllCategories(), onSubmit: jest.fn(async () => true), onClose: jest.fn(), ...props });
}
const amountInput = (form) => form.nodes('TextInput').find((node) => node.props.accessibilityLabel === translate('en', 'add.amountLabel'));
const saveButton = (form) => form.nodes('Pressable').find((node) => ['add.save', 'edit.save', 'add.saving'].some((key) => textOf(node) === translate('en', key)));
const formCurrency = (form) => form.nodes('CurrencyPill')[0].props.value;

beforeEach(async () => {
  mockFrames = []; global.__DEV__ = false;
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Live network is forbidden in App tests'));
  require('../fxRateService').getHistoricalFxRate.mockReset().mockResolvedValue({ status: 'unavailable' });
  for (const scope of ['alice', 'bob', storage.LOCAL_USER]) require('../fxRateService').resumeFxRates(scope);
  cloud.isSupabaseConfigured = true;
  sync.syncWithServer.mockReset().mockResolvedValue(null);
  sync.enqueueExpenseUpsert.mockReset().mockResolvedValue(undefined);
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', onboardingDone: true });
});
afterEach(() => {
  for (const frame of mockFrames) for (const hook of frame.hooks) hook?.cleanup?.();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  jest.restoreAllMocks(); delete global.__DEV__;
});

it('falls back to Display Currency and remembers USD only after the real create callback saves it locally', async () => {
  const app = await mountApp();
  expect(openNew(app).props.defaultCurrency).toBe('TWD');
  expect(await newForm(app).props.onSubmit(expense())).toBe(true);
  await settle(app);
  expect(settingsOf(app)).toMatchObject({ displayCurrency: 'TWD', lastPersonalExpenseCurrency: 'USD' });
  expect((await storage.loadSettings('alice')).lastPersonalExpenseCurrency).toBe('USD');
  expect(openNew(app).props.defaultCurrency).toBe('USD');
  expect(sync.enqueueSettingsPush).not.toHaveBeenCalled();
  expect(sync.enqueueExpenseUpsert).toHaveBeenCalledTimes(1);
});

it('reloads the remembered preference, and Display Currency changes do not replace it', async () => {
  const first = await mountApp();
  await openNew(first).props.onSubmit(expense('JPY')); await settle(first);
  const reloaded = await mountApp();
  expect(openNew(reloaded).props.defaultCurrency).toBe('JPY');
  reloaded.nodes('AccountScreen')[0].props.onUpdateSettings({ displayCurrency: 'EUR' });
  await settle(reloaded);
  expect(openNew(reloaded).props.defaultCurrency).toBe('JPY');
  expect((await storage.loadSettings('alice')).lastPersonalExpenseCurrency).toBe('JPY');
});

it('does not remember a canceled draft, and a subsequent opening gets a new draft identity', async () => {
  const app = await mountApp();
  const first = openNew(app);
  first.props.onClose(); app.render();
  expect(openNew(app).key).not.toBe(first.key);
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBeNull();
  expect((await storage.loadSettings('alice')).lastPersonalExpenseCurrency).toBeNull();
});

it('does not publish expense or preference changes when the local write fails', async () => {
  const app = await mountApp();
  const form = openNew(app);
  AsyncStorage.setItem.mockRejectedValueOnce(new Error('storage full'));
  await expect(form.props.onSubmit(expense())).rejects.toThrow('storage full');
  await settle(app);
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBeNull();
  expect(await storage.loadExpenses('alice')).toEqual([]);
  expect(sync.enqueueExpenseUpsert).not.toHaveBeenCalled();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(true);
});

it('rejects invalid personal saves without remembering their currency', async () => {
  const app = await mountApp();
  const form = openNew(app);
  expect(await form.props.onSubmit(expense('USD', { amount: NaN }))).toBe(false);
  expect(await form.props.onSubmit(expense('XXX'))).toBe(false);
  app.render();
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBeNull();
  expect(await storage.loadExpenses('alice')).toEqual([]);
});

it('successful edits remember the edited currency without changing unrelated transactions', async () => {
  const old = expense('EUR', { id: 'old', createdAt: 1000 });
  const other = expense('TWD', { id: 'other', createdAt: 2000 });
  await storage.saveExpenses('alice', [other, old]);
  const app = await mountApp();
  app.nodes('ExpenseListScreen')[0].props.onEditPress({ sourceType: 'personal', id: 'old' }); app.render();
  const edit = app.nodes('AddEntryScreen').find((node) => node.props.editEntry);
  expect(edit.props.editEntry.currency).toBe('EUR');
  expect(await edit.props.onSubmit({ ...old, currency: 'JPY' })).toBe(true);
  await settle(app);
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBe('JPY');
  expect((await storage.loadExpenses('alice')).find((item) => item.id === 'other')).toEqual(other);
});

it.each([false, true])('edits USD 20 on 2026-10-19 to JPY 100 with foodtest; storage failure: %s', async (failWrite) => {
  const original = expense('USD', { id: 'food-edit', amount: 20, createdAt: new Date(2026, 9, 19, 12).getTime() });
  await storage.saveExpenses('alice', [original]);
  await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, lastPersonalExpenseCurrency: 'USD', onboardingDone: true });
  const app = await mountApp();
  app.nodes('ExpenseListScreen')[0].props.onEditPress({ sourceType: 'personal', id: original.id }); app.render();
  const edit = app.nodes('AddEntryScreen').find((node) => node.props.editEntry);
  const form = formRenderer(edit.props);
  expect(amountInput(form).props.value).toBe('20.00');
  form.nodes('CurrencyPicker')[0].props.onSelect('JPY'); form.render();
  // Reproduce replacing only the integer part: before the fix this left 100.00.
  amountInput(form).props.onChangeText(amountInput(form).props.value.replace(/^20/, '100')); form.render();
  expect(amountInput(form).props.value).toBe('100');
  form.nodes('TextInput').find((node) => node.props.placeholder === translate('en', 'add.notePlaceholder')).props.onChangeText('foodtest'); form.render();
  expect(saveButton(form).props.disabled).toBe(false);
  expect(saveButton(form).props.accessibilityState).toEqual({ disabled: false, busy: false });
  expect(saveButton(form).props.style({ pressed: false }).some((style) => style && style.opacity === 0.4)).toBe(false);
  if (failWrite) AsyncStorage.setItem.mockRejectedValueOnce(new Error('storage full'));
  await saveButton(form).props.onPress(); form.render(); await settle(app);
  if (failWrite) {
    expect(await storage.loadExpenses('alice')).toEqual([original]);
    expect(settingsOf(app).lastPersonalExpenseCurrency).toBe('USD');
    expect(form.nodes('Text').some((node) => node.props.accessibilityRole === 'alert')).toBe(true);
    expect(saveButton(form).props.disabled).toBe(false);
  } else {
    expect(await storage.loadExpenses('alice')).toEqual([{ ...original, currency: 'JPY', amount: 100, note: 'foodtest' }]);
    expect(settingsOf(app).lastPersonalExpenseCurrency).toBe('JPY');
    expect((await storage.loadSettings('alice')).lastPersonalExpenseCurrency).toBe('JPY');
    expect(app.nodes('AddEntryScreen').some((node) => node.props.editEntry)).toBe(false);
  }
});

it.each(['JPY', 'TWD', 'KRW'])('keeps a whole USD edit valid when switching its formatted amount to %s', (currency) => {
  const form = formRenderer({ editEntry: expense('USD', { id: 'food-edit', amount: 20, createdAt: new Date(2026, 9, 19, 12).getTime() }) });
  expect(amountInput(form).props.value).toBe('20.00');
  form.nodes('CurrencyPicker')[0].props.onSelect(currency); form.render();
  expect(amountInput(form).props.value).toBe('20');
  expect(saveButton(form).props.disabled).toBe(false);
  // Replacing the integer part now cannot leave a hidden USD decimal suffix.
  amountInput(form).props.onChangeText('100'); form.render();
  expect(saveButton(form).props.disabled).toBe(false);
});

it('does not round away a real fractional amount or relax zero-decimal validation', () => {
  const form = formRenderer({ editEntry: expense('USD', { id: 'fractional', amount: 20.25, createdAt: Date.now() }) });
  form.nodes('CurrencyPicker')[0].props.onSelect('JPY'); form.render();
  expect(amountInput(form).props.value).toBe('20.25');
  expect(saveButton(form).props.disabled).toBe(true);
  amountInput(form).props.onChangeText('100.25'); form.render();
  expect(saveButton(form).props.disabled).toBe(true);
  amountInput(form).props.onChangeText('100'); form.render();
  expect(saveButton(form).props.disabled).toBe(false);
});

it('preserves decimal-currency formatting, and only removes zero fractions for a zero-decimal currency', () => {
  const form = formRenderer({ editEntry: expense('USD', { id: 'food-edit', amount: 20, createdAt: Date.now() }) });
  form.nodes('CurrencyPicker')[0].props.onSelect('EUR'); form.render();
  expect(amountInput(form).props.value).toBe('20.00');
  amountInput(form).props.onChangeText('100,00'); form.render();
  form.nodes('CurrencyPicker')[0].props.onSelect('JPY'); form.render();
  expect(amountInput(form).props.value).toBe('100');
  expect(saveButton(form).props.disabled).toBe(false);
});

it.each([
  ['create', 'expense'], ['edit', 'expense'],
  ['create', 'queue'], ['edit', 'queue'],
  ['create', 'preference'], ['edit', 'preference'],
])('queues a %s for its original account when switching during %s persistence', async (kind, phase) => {
  const old = expense('USD', { id: 'existing', createdAt: 1000 });
  if (kind === 'edit') await storage.saveExpenses('alice', [old]);
  await storage.saveSettings('bob', { ...storage.DEFAULT_SETTINGS, lastPersonalExpenseCurrency: 'JPY', onboardingDone: true });
  await storage.saveGroups('bob', [{ id: 'bob-group', name: 'Bob trip', currency: 'JPY', members: [] }]);
  const app = await mountApp();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const original = AsyncStorage.setItem.getMockImplementation();
  let blocked = false;
  if (phase === 'queue') {
    sync.enqueueExpenseUpsert.mockImplementationOnce(async () => { entered(); await gate; });
  } else {
    const key = phase === 'expense' ? '@expense-tracker/expenses:alice' : '@expense-tracker/settings:alice';
    AsyncStorage.setItem.mockImplementation(async (...args) => {
      if (!blocked && args[0] === key) { blocked = true; entered(); await gate; }
      return original(...args);
    });
  }
  let submit;
  if (kind === 'edit') {
    app.nodes('ExpenseListScreen')[0].props.onEditPress({ sourceType: 'personal', id: old.id }); app.render();
    submit = app.nodes('AddEntryScreen').find((node) => node.props.editEntry).props.onSubmit;
  } else submit = openNew(app).props.onSubmit;
  const pending = submit(expense('EUR', kind === 'edit' ? { id: old.id, createdAt: old.createdAt } : {}));
  await started;
  mockAuthListener('SIGNED_IN', { user: { id: 'bob' } }); await settle(app);
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBe('JPY');
  app.nodes('GroupDetailScreen')[0].props.onAddBill('bob-group'); app.render();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(true);
  release(); expect(await pending).toBe(true); await settle(app);
  AsyncStorage.setItem.mockImplementation(original);
  const saved = (await storage.loadExpenses('alice'))[0];
  expect(saved.currency).toBe('EUR');
  expect(sync.enqueueExpenseUpsert).toHaveBeenCalledTimes(1);
  expect(sync.enqueueExpenseUpsert).toHaveBeenCalledWith('alice', saved);
  expect((await storage.loadSettings('alice')).lastPersonalExpenseCurrency).toBe('EUR');
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBe('JPY');
  expect((await storage.loadSettings('bob')).lastPersonalExpenseCurrency).toBe('JPY');
  expect(await storage.loadExpenses('bob')).toEqual([]);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(true);
  expect(app.nodes('SharedSplitForm')[0].props.lockedGroupId).toBe('bob-group');
  expect(alertInfo).not.toHaveBeenCalled();
  app.nodes('SharedSplitForm')[0].props.onClose(); app.render();
  expect(openNew(app).props.defaultCurrency).toBe('JPY');
});

it.each([['create', 'USD'], ['edit', 'USD'], ['create', null], ['edit', null]])(
  'keeps a successful %s when preference persistence fails with prior preference %s', async (kind, previous) => {
  await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', lastPersonalExpenseCurrency: previous, onboardingDone: true });
  const old = expense('USD', { id: 'existing', amount: 20, createdAt: 1000 });
  if (kind === 'edit') await storage.saveExpenses('alice', [old]);
  const app = await mountApp();
  let props;
  if (kind === 'edit') {
    app.nodes('ExpenseListScreen')[0].props.onEditPress({ sourceType: 'personal', id: old.id }); app.render();
    props = app.nodes('AddEntryScreen').find((node) => node.props.editEntry).props;
  } else props = openNew(app).props;
  const form = formRenderer(props);
  form.nodes('CurrencyPicker')[0].props.onSelect('JPY'); form.render();
  amountInput(form).props.onChangeText('100'); form.render();
  const original = AsyncStorage.setItem.getMockImplementation();
  AsyncStorage.setItem.mockImplementation((key, value) => key === '@expense-tracker/settings:alice'
    ? Promise.reject(new Error('settings storage failed')) : original(key, value));
  await saveButton(form).props.onPress(); form.render(); await settle(app);
  AsyncStorage.setItem.mockImplementation(original);
  const records = await storage.loadExpenses('alice');
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ amount: 100, currency: 'JPY' });
  expect(sync.enqueueExpenseUpsert).toHaveBeenCalledWith('alice', records[0]);
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBe(previous);
  expect((await storage.loadSettings('alice')).lastPersonalExpenseCurrency).toBe(previous);
  expect(form.nodes('Text').some((node) => node.props.accessibilityRole === 'alert')).toBe(false);
  expect(alertInfo).toHaveBeenCalledWith({
    title: translate('en', 'add.currencyRememberFailedTitle'),
    body: translate('en', 'add.currencyRememberFailed'), okLabel: 'OK',
  });
  const reloaded = await mountApp();
  expect(openNew(reloaded).props.defaultCurrency).toBe(previous ?? 'TWD');
  expect(await storage.loadExpenses('alice')).toEqual(records);
  expect(sync.enqueueSettingsPush).not.toHaveBeenCalled();
});

it.each(['throw', 'reject'])('does not report transaction failure if the optional warning itself fails: %s', async (failure) => {
  const app = await mountApp();
  jest.spyOn(storage, 'saveSettings').mockRejectedValueOnce(new Error('preference write failed'));
  alertInfo.mockImplementationOnce(() => {
    if (failure === 'throw') throw new Error('warning unavailable');
    return Promise.reject(new Error('warning unavailable'));
  });
  expect(await openNew(app).props.onSubmit(expense('JPY'))).toBe(true);
  await settle(app);
  expect((await storage.loadExpenses('alice'))[0].currency).toBe('JPY');
  expect(settingsOf(app).lastPersonalExpenseCurrency).toBeNull();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
});

it('does not initialize an open local draft before the asynchronous settings load finishes', async () => {
  cloud.isSupabaseConfigured = false;
  let release;
  jest.spyOn(storage, 'loadSettings').mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const app = await mountApp();
  openNew(app);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  release({ ...storage.DEFAULT_SETTINGS, displayCurrency: 'EUR', lastPersonalExpenseCurrency: 'USD' });
  await settle(app);
  expect(openNew(app).props.defaultCurrency).toBe('USD');
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(true);
});

it('keeps the remembered currency and active draft through an in-flight server settings refresh', async () => {
  await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', lastPersonalExpenseCurrency: 'JPY', onboardingDone: true });
  let release;
  sync.syncWithServer.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const app = await mountApp();
  const initial = openNew(app);
  const form = formRenderer(initial.props);
  amountInput(form).props.onChangeText('120'); form.render();
  release({ expenses: [], settings: { displayCurrency: 'EUR' } }); await settle(app);
  expect(newForm(app).key).toBe(initial.key);
  Object.assign(form.props, newForm(app).props); form.render();
  expect(formCurrency(form)).toBe('JPY');
  expect(amountInput(form).props.value).toBe('120');
  expect(settingsOf(app)).toMatchObject({ displayCurrency: 'EUR', lastPersonalExpenseCurrency: 'JPY' });
});

it('initializes a personal form once and keeps the active draft stable across preference and reporting changes', () => {
  const form = formRenderer({ defaultCurrency: 'USD' });
  amountInput(form).props.onChangeText('12.34'); form.render();
  form.props.defaultCurrency = 'JPY'; form.props.displayCurrency = 'EUR'; form.render();
  expect(formCurrency(form)).toBe('USD');
  expect(amountInput(form).props.value).toBe('12.34');
  form.nodes('CurrencyPicker')[0].props.onSelect('CAD'); form.render();
  form.props.defaultCurrency = 'TWD'; form.render();
  expect(formCurrency(form)).toBe('CAD');
  expect(form.props.onSubmit).not.toHaveBeenCalled();
});

it('uses Display Currency for an invalid preference, and existing saved currency for edits', () => {
  const fresh = formRenderer({ defaultCurrency: 'XXX' });
  expect(formCurrency(fresh)).toBe('TWD');
  const edit = formRenderer({ defaultCurrency: 'USD', editEntry: expense('EUR', { id: 'old', createdAt: Date.now() }) });
  expect(formCurrency(edit)).toBe('EUR');
});

it.each([false, 'reject'])('retains the draft and shows an error for an unsuccessful save: %s', async (result) => {
  const onSubmit = jest.fn(() => result === 'reject' ? Promise.reject(new Error('disk')) : Promise.resolve(false));
  const form = formRenderer({ defaultCurrency: 'USD', onSubmit });
  form.nodes('CurrencyPicker')[0].props.onSelect('EUR');
  amountInput(form).props.onChangeText('12.34'); form.render();
  await saveButton(form).props.onPress(); form.render();
  expect(formCurrency(form)).toBe('EUR');
  expect(amountInput(form).props.value).toBe('12.34');
  expect(form.nodes('Text').some((node) => node.props.accessibilityRole === 'alert')).toBe(true);
});

it('does not submit invalid forms or treat currency selection/cancel as a save', async () => {
  const form = formRenderer();
  form.nodes('CurrencyPicker')[0].props.onSelect('USD'); form.render();
  await saveButton(form).props.onPress();
  form.props.onClose();
  expect(form.props.onSubmit).not.toHaveBeenCalled();
});

it('marks a pending save busy and prevents double submission', async () => {
  let finish;
  const onSubmit = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const onChangeEntryMode = jest.fn();
  const form = formRenderer({ defaultCurrency: 'USD', onSubmit, onChangeEntryMode });
  amountInput(form).props.onChangeText('10'); form.render();
  const saving = saveButton(form).props.onPress(); form.render();
  expect(saveButton(form).props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(form.nodes('Pressable').find((node) => node.props.accessibilityLabel === 'Close').props.disabled).toBe(true);
  form.nodes('EntryModeToggle')[0].props.onChange('shared');
  expect(onChangeEntryMode).not.toHaveBeenCalled();
  await saveButton(form).props.onPress();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  finish(true); await saving; form.render();
  expect(amountInput(form).props.value).toBe('');
});

it.each(['create', 'edit'])('blocks picker interaction during a pending %s and leaves no open picker after success', async (kind) => {
  const old = expense('USD', { id: 'existing', amount: 20, createdAt: 1000 });
  if (kind === 'edit') await storage.saveExpenses('alice', [old]);
  const app = await mountApp();
  let props;
  if (kind === 'edit') {
    app.nodes('ExpenseListScreen')[0].props.onEditPress({ sourceType: 'personal', id: old.id }); app.render();
    props = app.nodes('AddEntryScreen').find((node) => node.props.editEntry).props;
  } else props = openNew(app).props;
  const form = formRenderer(props);
  amountInput(form).props.onChangeText('100'); form.render();
  form.nodes('CurrencyPill')[0].props.onPress(); form.render();
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(true);
  const staleOpen = form.nodes('CurrencyPill')[0].props.onPress;
  let release;
  const original = AsyncStorage.setItem.getMockImplementation();
  AsyncStorage.setItem.mockImplementationOnce(async (...args) => {
    await new Promise((resolve) => { release = resolve; });
    return original(...args);
  });
  const pending = saveButton(form).props.onPress(); form.render();
  expect(form.nodes('CurrencyPill')[0].props.disabled).toBe(true);
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(false);
  staleOpen(); form.render();
  form.nodes('CurrencyPicker')[0].props.onSelect('JPY'); form.render();
  expect(formCurrency(form)).toBe(kind === 'edit' ? 'USD' : props.defaultCurrency);
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(false);
  release(); await pending; await settle(app);
  if (kind === 'create') {
    expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
    Object.assign(form.props, newForm(app).props);
  } else expect(app.nodes('AddEntryScreen').some((node) => node.props.editEntry)).toBe(false);
  form.render();
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(false);
  expect(await storage.loadExpenses('alice')).toHaveLength(1);
});

it.each([false, true])('clears picker state when its parent closes and keeps normal dismissal: editing %s', (editing) => {
  const form = formRenderer(editing ? { editEntry: expense('USD', { id: 'old', createdAt: 1000 }) } : {});
  form.nodes('CurrencyPill')[0].props.onPress(); form.render();
  form.nodes('CurrencyPicker')[0].props.onClose(); form.render();
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(false);
  form.nodes('CurrencyPill')[0].props.onPress(); form.render();
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(true);
  form.props.visible = false; form.render();
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(false);
  form.nodes('CurrencyPicker')[0].props.onSelect('EUR'); form.render();
  form.props.visible = true; form.render();
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(false);
  expect(formCurrency(form)).toBe(editing ? 'USD' : 'TWD');
  expect(form.props.onSubmit).not.toHaveBeenCalled();
});

it('exposes the disabled currency trigger to native controls and screen readers', () => {
  const pill = renderer(RealCurrencyPill, { value: 'USD', disabled: true });
  expect(pill.tree().props.disabled).toBe(true);
  expect(pill.tree().props.accessibilityState).toEqual({ disabled: true });
});

it('shares one order across every picker location using raw saved personal and shared records', async () => {
  const group = { id: 'trip', name: 'Trip', currency: 'GBP', members: [] };
  const personal = [expense('USD', { id: 'usd', createdAt: 1 }), expense('JPY', { id: 'jpy', createdAt: 1 })];
  const shared = { id: 'bill', groupId: group.id, currency: 'JPY', amount: 100, paidBy: 'you', shares: { you: 100 }, createdAt: 1 };
  await storage.saveExpenses('alice', personal);
  await storage.saveGroups('alice', [group]);
  await storage.saveSplitExpenses('alice', [shared, { ...shared, id: 'payment', settlement: true, currency: 'EUR' }]);
  await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', lastPersonalExpenseCurrency: 'EUR', onboardingDone: true });
  const app = await mountApp();
  const draft = openNew(app);
  const ordered = draft.props.currencies;
  expect(ordered.map(({ code }) => code).slice(0, 2)).toEqual(['JPY', 'USD']);
  expect(ordered).toHaveLength(13);
  expect(draft.props.defaultCurrency).toBe('EUR');
  for (const screen of ['AccountScreen', 'CreateGroupScreen', 'GroupDetailScreen']) {
    expect(app.nodes(screen)[0].props.currencies).toBe(ordered);
  }
  expect(settingsOf(app).displayCurrency).toBe('TWD');
  draft.props.onChangeEntryMode('shared'); app.render();
  expect(app.nodes('SharedSplitForm')[0].props.currencies.map(({ code }) => code)).toEqual(ordered.map(({ code }) => code));
  app.nodes('GroupDetailScreen')[0].props.onEditBill(shared); app.render();
  expect(app.nodes('SharedSplitForm').find((node) => node.props.editBill).props.currencies).toEqual(ordered);
  app.nodes('ExpenseListScreen')[0].props.onEditPress({ sourceType: 'personal', id: 'usd' }); app.render();
  expect(app.nodes('AddEntryScreen').find((node) => node.props.editEntry).props.currencies).toEqual(ordered);
});

it('reorders on saved personal creates, edits, and deletes', async () => {
  const app = await mountApp();
  const canceled = openNew(app);
  const unsaved = formRenderer(canceled.props);
  unsaved.nodes('CurrencyPicker')[0].props.onSelect('CAD'); unsaved.render();
  canceled.props.onClose(); await settle(app);
  expect(newForm(app).props.currencies).toEqual(CURRENCIES);
  await openNew(app).props.onSubmit(expense('JPY')); await settle(app);
  expect(newForm(app).props.currencies[0].code).toBe('JPY');
  const saved = (await storage.loadExpenses('alice'))[0];
  app.nodes('ExpenseListScreen')[0].props.onEditPress({ sourceType: 'personal', id: saved.id }); app.render();
  await app.nodes('AddEntryScreen').find((node) => node.props.editEntry).props.onSubmit({ ...saved, currency: 'CAD' });
  await settle(app);
  expect(newForm(app).props.currencies[0].code).toBe('CAD');
  app.nodes('ExpenseListScreen')[0].props.onDelete(saved.id); await settle(app);
  expect(newForm(app).props.currencies).toEqual(CURRENCIES);
});

it('reorders after saved shared-bill creation, editing, and deletion without counting your share twice', async () => {
  jest.spyOn(sync, 'enqueueSplitUpsert').mockResolvedValue(undefined);
  jest.spyOn(sync, 'enqueueSplitDelete').mockResolvedValue(undefined);
  const group = { id: 'trip', name: 'Trip', currency: 'JPY', members: [] };
  await storage.saveGroups('alice', [group]);
  await storage.saveExpenses('alice', [expense('USD', { id: 'personal', createdAt: 1 })]);
  const app = await mountApp();
  app.nodes('GroupDetailScreen')[0].props.onAddBill(group.id); app.render();
  app.nodes('SharedSplitForm')[0].props.onAdd({
    groupId: group.id, currency: 'JPY', amount: 100, paidBy: 'you', shares: { you: 100 }, createdAt: 1,
  }); await settle(app);
  // One personal USD and one JPY bill tie, even though the bill also has a derived spending row.
  expect(app.nodes('AccountScreen')[0].props.currencies.slice(0, 2).map(({ code }) => code)).toEqual(['USD', 'JPY']);
  const saved = (await storage.loadSplitExpenses('alice'))[0];
  app.nodes('GroupDetailScreen')[0].props.onEditBill(saved); app.render();
  app.nodes('SharedSplitForm').find((node) => node.props.editBill).props.onSave({ ...saved, currency: 'EUR' });
  await settle(app);
  expect(app.nodes('AccountScreen')[0].props.currencies.slice(0, 2).map(({ code }) => code)).toEqual(['USD', 'EUR']);
  app.nodes('GroupDetailScreen')[0].props.onDeleteBill(saved.id); await settle(app);
  expect(app.nodes('AccountScreen')[0].props.currencies).toEqual(CURRENCIES);
});

it('uses catalog order during an account switch and only the newly loaded account history afterward', async () => {
  await storage.saveExpenses('alice', [expense('JPY', { id: 'alice', createdAt: 1 })]);
  const app = await mountApp();
  expect(newForm(app).props.currencies[0].code).toBe('JPY');
  await storage.saveSettings('bob', { ...storage.DEFAULT_SETTINGS, onboardingDone: true });
  let release;
  jest.spyOn(storage, 'loadExpenses').mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  mockAuthListener('SIGNED_IN', { user: { id: 'bob' } }); await settle(app);
  // The loading surface hides every picker until Bob's collections are ready.
  expect(app.nodes('AccountScreen')).toEqual([]);
  expect(app.nodes('AddEntryScreen')).toEqual([]);
  release([expense('EUR', { id: 'bob', createdAt: 1 })]); await settle(app);
  expect(newForm(app).props.currencies[0].code).toBe('EUR');
  expect(newForm(app).props.currencies.indexOf(CURRENCIES.find(({ code }) => code === 'USD')))
    .toBeLessThan(newForm(app).props.currencies.indexOf(CURRENCIES.find(({ code }) => code === 'JPY')));
});

it('updates frequency order on sync without replacing the active personal draft or its selection', async () => {
  let release;
  sync.syncWithServer.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const app = await mountApp();
  const draft = openNew(app);
  const form = formRenderer(draft.props);
  form.nodes('CurrencyPicker')[0].props.onSelect('GBP'); form.render();
  amountInput(form).props.onChangeText('12.34'); form.render();
  release({ expenses: [expense('JPY', { id: 'loaded', createdAt: 1 })], settings: null }); await settle(app);
  expect(newForm(app).key).toBe(draft.key);
  Object.assign(form.props, newForm(app).props); form.render();
  expect(form.nodes('CurrencyPicker')[0].props.currencies[0].code).toBe('JPY');
  expect(formCurrency(form)).toBe('GBP');
  expect(amountInput(form).props.value).toBe('12.34');
});

it.each([false, true])('preserves personal default/edited selection when order changes; editing: %s', (editing) => {
  const form = formRenderer({ defaultCurrency: 'EUR', ...(editing ? { editEntry: expense('CAD', { id: 'old', createdAt: 1 }) } : {}) });
  form.nodes('CurrencyPill')[0].props.onPress(); form.render();
  form.props.currencies = currenciesByFrequency([expense('JPY', { id: 'saved' })]); form.render();
  expect(formCurrency(form)).toBe(editing ? 'CAD' : 'EUR');
  expect(form.nodes('CurrencyPicker')[0].props.visible).toBe(true);
  expect(form.props.onSubmit).not.toHaveBeenCalled();
});

it.each([false, true])('forwards order without changing the group default or saved shared-bill currency; editing: %s', (editing) => {
  const group = { id: 'trip', name: 'Trip', currency: 'JPY', members: [] };
  const form = renderer(SharedForm, {
    groups: [group], displayCurrency: 'TWD', onAdd: jest.fn(),
    ...(editing ? { editBill: { id: 'bill', groupId: 'trip', currency: 'EUR', amount: 20, paidBy: 'you', shares: { you: 20 }, createdAt: 1 } } : {}),
  });
  const selected = editing ? 'EUR' : 'JPY';
  expect(form.nodes('CurrencyPicker')[0].props.value).toBe(selected);
  form.props.currencies = currenciesByFrequency([expense('USD', { id: 'saved' })]); form.render();
  expect(form.nodes('CurrencyPicker')[0].props.currencies).toBe(form.props.currencies);
  expect(form.nodes('CurrencyPicker')[0].props.value).toBe(selected);
  form.nodes('CurrencyPicker')[0].props.onSelect('CAD'); form.render();
  form.props.currencies = [...CURRENCIES].reverse(); form.render();
  expect(form.nodes('CurrencyPicker')[0].props.value).toBe('CAD');
  expect(form.props.onAdd).not.toHaveBeenCalled();
});

it('forwards ordering through group creation and editing without changing their selected currencies', () => {
  const create = renderer(CreateGroup, { visible: true, defaultCurrency: 'JPY', onCreate: jest.fn() });
  create.nodes('CurrencyPicker')[0].props.onSelect('EUR'); create.render();
  create.props.currencies = currenciesByFrequency([expense('USD', { id: 'saved' })]); create.render();
  expect(create.nodes('CurrencyPicker')[0].props.currencies).toBe(create.props.currencies);
  expect(create.nodes('CurrencyPicker')[0].props.value).toBe('EUR');
  const detail = renderer(GroupDetail, {
    visible: true, group: { id: 'trip', name: 'Trip', currency: 'JPY', members: [] },
    splitExpenses: [], onUpdateGroup: jest.fn(),
  });
  detail.props.currencies = create.props.currencies; detail.render();
  expect(detail.nodes('CurrencyPicker')[0].props.currencies).toBe(create.props.currencies);
  expect(detail.nodes('CurrencyPicker')[0].props.value).toBe('JPY');
  expect(detail.props.onUpdateGroup).not.toHaveBeenCalled();
});

// FX-4C2 exercises the actual App-owned hook and screen props using the same
// account/form harness; only the rate-service boundary is controlled.
const fxService = require('../fxRateService');
const savedFxExpense = (patch = {}) => expense('USD', {
  id: 'fx-personal', amount: 20, createdAt: Date.now() - 86400000, ...patch,
});
const fxObservation = (request, rate = 2, stale = false) => ({ status: 'available', quote: {
  baseCurrency: request.baseCurrency, quoteCurrency: request.quoteCurrency, rate,
  effectiveDate: request.transactionDate, sourceType: 'historical', provider: 'frankfurter-v2:BOC',
  retrievedAt: new Date(Date.now() - (stale ? 2 * 86400000 : 0)).toISOString(),
}, cache: { stale } });
const fxGate = () => { let resolve; const promise = new Promise((finish) => { resolve = finish; }); return { promise, resolve }; };
const fxScreens = (app) => ({ dashboard: app.nodes('DashboardScreen')[0]?.props,
  list: app.nodes('ExpenseListScreen')[0]?.props, insight: app.nodes('InsightScreen')[0]?.props });
async function editFxExpense(app, record) {
  fxScreens(app).list.onEditPress({ sourceType: 'personal', id: record.id }); app.render();
  expect(await app.nodes('AddEntryScreen').find((node) => node.props.editEntry).props.onSubmit(record)).toBe(true);
  await settle(app);
}

describe('production reporting FX integration', () => {
  beforeEach(() => {
    // Keep relative transaction dates in the browsing month; only fake Date so
    // promises, effects, and request completion retain their real scheduling.
    jest.useFakeTimers({
      now: new Date(2026, 9, 15, 12),
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask',
        'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
  });
  afterEach(() => { jest.useRealTimers(); });

  it('gates initial account loading, then shows Estimated/loading immediately before the quote arrives', async () => {
    const source = savedFxExpense(), cache = fxGate(), quote = fxGate();
    jest.spyOn(storage, 'loadExpenses').mockImplementationOnce(() => cache.promise);
    fxService.getHistoricalFxRate.mockImplementation(() => quote.promise);
    const app = await mountApp();
    expect(fxScreens(app).dashboard).toBeUndefined(); expect(fxService.getHistoricalFxRate).not.toHaveBeenCalled();
    cache.resolve([source]); await settle(app);
    const pending = fxScreens(app);
    expect(pending.dashboard.monthTotal).toBe(650);
    expect(pending.dashboard.coverage).toMatchObject({ estimated: 1, loading: 1 });
    expect(pending.list.spendingSections[0].data[0].fx).toMatchObject({ status: 'estimated', loading: true });
    for (const screen of Object.values(pending)) expect(screen.fxReady).toBe(true);
    quote.resolve(fxObservation(fxService.getHistoricalFxRate.mock.calls[0][1])); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(40);
    expect(fxScreens(app).dashboard.coverage).toMatchObject({ historical: 1, estimated: 0, loading: 0 });
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
  });

  it('shares full-precision personal/your-share valuations once, excluding settlements and preserving financial sources', async () => {
    const source = savedFxExpense(), rate = 2.3456789;
    const group = { id: 'fx-group', name: 'FX group', currency: 'USD', members: [{ id: 'friend', name: 'Friend' }] };
    const bill = { id: 'fx-bill', groupId: group.id, amount: 100, currency: 'USD', category: 'transport',
      paidBy: 'you', shares: { you: 25, friend: 75 }, createdAt: source.createdAt };
    const bills = [bill, { ...bill, id: 'settlement', settlement: true, amount: 5, shares: { friend: 5 } }];
    const settings = { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', monthlyBudget: 1000,
      categoryBudgets: { food: 200, transport: 300 }, lastPersonalExpenseCurrency: 'JPY', onboardingDone: true };
    await storage.saveExpenses('alice', [source]); await storage.saveGroups('alice', [group]);
    await storage.saveSplitExpenses('alice', bills); await storage.saveSettings('alice', settings);
    fxService.getHistoricalFxRate.mockImplementation(async (_, request) => fxObservation(request, rate));
    const app = await mountApp(), { dashboard, list, insight } = fxScreens(app);
    expect(dashboard.categoryMonths).toBe(insight.months); expect(dashboard.coverage).toBe(insight.months[0].coverage);
    expect(dashboard.monthTotal).toBeCloseTo(45 * rate, 10);
    expect(dashboard.dailyTotals.reduce((sum, value) => sum + value, 0)).toBeCloseTo(dashboard.monthTotal, 10);
    expect(insight.months[0].byCategory).toEqual({ food: 20 * rate, transport: 25 * rate });
    expect(list.spendingSections[0].data).toHaveLength(2);
    expect(list.spendingSections[0].data.find((row) => row.sourceType === 'shared')).toMatchObject({ amount: 25, currency: 'USD', displayAmount: 25 * rate });
    expect(dashboard.coverage).toMatchObject({ total: 2, historical: 2, complete: true });
    const filtered = require('../spendingActivity').spendingForDay(list.spendingSections, require('../format').dateKey(source.createdAt), 'food', getAllCategories(), true);
    expect(filtered).toMatchObject({ filteredTotal: 20 * rate, coverage: { total: 1, historical: 1 } });
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    expect(await storage.loadExpenses('alice')).toEqual([source]); expect(await storage.loadSplitExpenses('alice')).toEqual(bills);
    expect(await storage.loadSettings('alice')).toMatchObject(settings);
    expect(app.nodes('SplitBillsScreen')[0].props.summary).toEqual(require('../splits').overallBalance([group], bills, 'TWD'));
    expect(openNew(app).props.defaultCurrency).toBe('JPY');
  });

  it.each([false, true])('keeps empty and identity-only reports ready with zero requests (identity=%s)', async (identity) => {
    if (identity) await storage.saveExpenses('alice', [savedFxExpense({ currency: 'TWD', amount: 7 })]);
    const app = await mountApp(), screens = fxScreens(app);
    expect(screens.dashboard.monthTotal).toBe(identity ? 7 : 0);
    expect(screens.dashboard.coverage).toMatchObject({ complete: true, identity: identity ? 1 : 0, loading: 0 });
    for (const screen of Object.values(screens)) expect(screen.fxReady).toBe(true);
    expect(fxService.getHistoricalFxRate).not.toHaveBeenCalled();
  });

  it('uses valid cached historical quotes without relabeling them Estimated', async () => {
    const source = savedFxExpense({ createdAt: Date.now() - 3 * 86400000 });
    await storage.saveExpenses('alice', [source]);
    fxService.getHistoricalFxRate.mockImplementation(async (_, request) => fxObservation(request, 2, true));
    const app = await mountApp(), selected = new Date(source.createdAt);
    const [year, month] = fxScreens(app).dashboard.monthKey.split('-').map(Number);
    fxScreens(app).list.onShiftMonth((selected.getFullYear() - year) * 12 + selected.getMonth() + 1 - month); await settle(app);
    const screens = fxScreens(app);
    expect(screens.dashboard.monthTotal).toBe(40);
    expect(screens.dashboard.coverage).toMatchObject({ historical: 1, stale: 1, estimated: 0 });
    expect(screens.list.spendingSections[0].data[0].fx.stale).toBe(true);
    app.render(); await settle(app); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
  });

  it('preserves unavailable totals instead of falling back to a legacy partial amount', async () => {
    await storage.saveExpenses('alice', [savedFxExpense(), savedFxExpense({ id: 'invalid', currency: 'ZZZ', category: 'bills' })]);
    const app = await mountApp(), { dashboard, list, insight } = fxScreens(app);
    expect(dashboard.monthTotal).toBeNull(); expect(insight.months[0].total).toBeNull();
    expect(dashboard.coverage).toMatchObject({ complete: false, estimated: 1, unavailable: 1 });
    expect(list.spendingSections[0].data.find((row) => row.id === 'invalid').displayAmount).toBeNull();
    for (const screen of [dashboard, list, insight]) expect(screen.fxReady).toBe(true);
  });

  it('isolates Alice -> Bob -> Alice before effects and rejects abort-ignoring old quotes', async () => {
    const source = savedFxExpense(), old = fxGate(), current = fxGate();
    await storage.saveExpenses('alice', [source]);
    await storage.saveExpenses('bob', [savedFxExpense({ id: 'bob-only', currency: 'TWD', amount: 7 })]);
    await storage.saveSettings('bob', { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', onboardingDone: true });
    fxService.getHistoricalFxRate.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    const app = await mountApp(), aliceToken = fxScreens(app).list.accountKey;
    mockAuthListener('SIGNED_IN', { user: { id: 'bob' } }); app.render(false);
    expect(fxScreens(app).dashboard).toBeUndefined();
    await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(7); expect(fxScreens(app).list.accountKey).not.toBe(aliceToken);
    mockAuthListener('SIGNED_IN', { user: { id: 'alice' } }); app.render(false);
    expect(fxScreens(app).dashboard).toBeUndefined(); await settle(app);
    expect(fxScreens(app).list.accountKey).not.toBe(aliceToken);
    const request = fxService.getHistoricalFxRate.mock.calls[0][1];
    expect(fxService.getHistoricalFxRate.mock.calls[0][2].signal.aborted).toBe(true);
    old.resolve(fxObservation(request, 99)); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(650);
    current.resolve(fxObservation(request, 3)); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(60);
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(2);
  });

  it('changes reporting currency immediately, ignores an old-target quote, and preserves budget redenomination', async () => {
    const source = savedFxExpense(), old = fxGate(), current = fxGate();
    await storage.saveExpenses('alice', [source]);
    await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', monthlyBudget: 3250,
      categoryBudgets: { food: 1625 }, lastPersonalExpenseCurrency: 'EUR', onboardingDone: true });
    fxService.getHistoricalFxRate.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    const app = await mountApp();
    app.nodes('AccountScreen')[0].props.onUpdateSettings({ displayCurrency: 'USD' }); app.render(false);
    for (const screen of Object.values(fxScreens(app))) expect(screen.displayCurrency).toBe('USD');
    expect(fxScreens(app).dashboard.monthTotal).toBe(20); // Identity is immediately current, without a request.
    await settle(app); old.resolve(fxObservation(fxService.getHistoricalFxRate.mock.calls[0][1], 99)); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(20); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    expect(settingsOf(app)).toMatchObject({ monthlyBudget: 100, categoryBudgets: { food: 50 }, lastPersonalExpenseCurrency: 'EUR' });
    app.nodes('AccountScreen')[0].props.onUpdateSettings({ displayCurrency: 'JPY' }); await settle(app);
    current.resolve(fxObservation(fxService.getHistoricalFxRate.mock.calls[1][1], 10)); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(200); expect(await storage.loadExpenses('alice')).toEqual([source]);
  });

  it('applies a pending quote to the latest edited amount without another request', async () => {
    const source = savedFxExpense(), gate = fxGate(); await storage.saveExpenses('alice', [source]);
    fxService.getHistoricalFxRate.mockImplementation(() => gate.promise);
    const app = await mountApp(); await editFxExpense(app, { ...source, amount: 30 });
    expect(fxScreens(app).dashboard.monthTotal).toBe(975);
    gate.resolve(fxObservation(fxService.getHistoricalFxRate.mock.calls[0][1])); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(60); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    expect((await storage.loadExpenses('alice'))[0]).toMatchObject({ amount: 30, currency: 'USD' });
    expect(settingsOf(app).lastPersonalExpenseCurrency).toBe('USD');
  });

  it('uses new keys for date/currency edits, reuses a category-only quote, and removes deleted reporting rows', async () => {
    const source = savedFxExpense(); await storage.saveExpenses('alice', [source]);
    fxService.getHistoricalFxRate.mockImplementation(async (_, request) => fxObservation(request));
    const app = await mountApp();
    await editFxExpense(app, { ...source, category: 'transport' });
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    expect(fxScreens(app).insight.months[0].byCategory).toEqual({ transport: 40 });
    const changedDate = { ...source, createdAt: source.createdAt - 86400000 };
    await editFxExpense(app, changedDate); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(2);
    await editFxExpense(app, { ...changedDate, currency: 'EUR' }); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(3);
    expect(fxService.getHistoricalFxRate.mock.calls.map((call) => call[1].baseCurrency)).toEqual(['USD', 'USD', 'EUR']);
    expect(fxService.getHistoricalFxRate.mock.calls[0][1].transactionDate).not.toBe(fxService.getHistoricalFxRate.mock.calls[1][1].transactionDate);
    fxScreens(app).list.onDelete(source.id); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(0); expect(fxScreens(app).list.spendingSections).toEqual([]);
    expect(await storage.loadExpenses('alice')).toEqual([]);
  });

  it('revalues a changed saved shared allocation without requesting or counting the full bill again', async () => {
    const group = { id: 'allocation', currency: 'USD', members: [{ id: 'friend', name: 'Friend' }] };
    const bill = { id: 'allocation-bill', groupId: group.id, amount: 100, currency: 'USD', paidBy: 'you',
      shares: { you: 25, friend: 75 }, createdAt: Date.now() - 86400000 };
    await storage.saveGroups('alice', [group]); await storage.saveSplitExpenses('alice', [bill]);
    fxService.getHistoricalFxRate.mockImplementation(async (_, request) => fxObservation(request));
    jest.spyOn(sync, 'enqueueSplitUpsert').mockResolvedValue(undefined);
    const app = await mountApp(); expect(fxScreens(app).dashboard.monthTotal).toBe(50);
    app.nodes('GroupDetailScreen')[0].props.onEditBill(bill); app.render();
    app.nodes('SharedSplitForm').find((node) => node.props.editBill).props.onSave({ ...bill, shares: { you: 40, friend: 60 } });
    await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(80); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    expect((await storage.loadSplitExpenses('alice'))[0]).toMatchObject({ amount: 100, currency: 'USD', shares: { you: 40, friend: 60 } });
  });

  it('reuses overlapping month quotes and the same model for browsing history', async () => {
    const source = savedFxExpense(), prior = new Date(source.createdAt); prior.setMonth(prior.getMonth() - 1);
    await storage.saveExpenses('alice', [source, savedFxExpense({ id: 'prior', amount: 5, createdAt: prior.getTime() })]);
    fxService.getHistoricalFxRate.mockImplementation(async (_, request) => fxObservation(request));
    const app = await mountApp(); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(2);
    fxScreens(app).list.onShiftMonth(-1); await settle(app);
    const screens = fxScreens(app);
    expect(screens.dashboard.monthTotal).toBe(10);
    expect(screens.dashboard.monthKey).toBe(screens.list.monthKey); expect(screens.list.monthKey).toBe(screens.insight.monthKey);
    expect(screens.dashboard.coverage).toMatchObject({ historical: 1, total: 1 });
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(2);
  });

  it('recovers a service-suspended reporting worker only on foreground refresh, ignoring the obsolete response', async () => {
    const old = fxGate(); await storage.saveExpenses('alice', [savedFxExpense()]);
    const response = (request, rate) => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify([
      { base: request.baseCurrency, quote: request.quoteCurrency, date: request.transactionDate, rate,
        providers: [{ key: 'BOC', date: request.transactionDate, rate }] },
    ]) });
    const cache = require('../fxRateCache').createFxRateCache(AsyncStorage);
    let transports = 0;
    fxService.getHistoricalFxRate.mockImplementation((scope, request, options) => jest.requireActual('../fxRateService').getHistoricalFxRate(scope, request, {
      ...options, cache, fetchImpl: async () => ++transports === 1 ? old.promise : response(request, 3),
    }));
    const app = await mountApp(); expect(transports).toBe(1);
    fxService.suspendFxRates('alice'); await settle(app);
    expect(fxScreens(app).dashboard.coverage).toMatchObject({ estimated: 1, loading: 0 });
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    fxService.resumeFxRates('alice'); app.render(); await settle(app);
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    require('react-native').AppState.addEventListener.mock.calls[0][1]('active'); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(60); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(2);
    old.resolve(response(fxService.getHistoricalFxRate.mock.calls[0][1], 99)); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(60);
  });

  it('blocks reporting immediately during Delete All Data and cannot repopulate from a late quote after resume', async () => {
    cloud.isSupabaseConfigured = false;
    const source = savedFxExpense(), old = fxGate();
    await storage.saveSettings(storage.LOCAL_USER, { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', onboardingDone: true });
    await storage.saveExpenses(storage.LOCAL_USER, [source]);
    fxService.getHistoricalFxRate.mockImplementation(() => old.promise);
    jest.spyOn(require('../confirm'), 'confirmDestructive').mockResolvedValue(true);
    const app = await mountApp(); expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
    const deleting = app.nodes('AccountScreen')[0].props.onDeleteAllData(); app.render(false);
    for (const screen of Object.values(fxScreens(app))) expect(screen.fxReady).toBe(false);
    expect(fxScreens(app).dashboard.monthTotal).toBeNull(); // Never an implicit static fallback while blocked.
    app.render(); require('react-native').AppState.addEventListener.mock.calls[0][1]('active'); app.render();
    await deleting; await settle(app);
    old.resolve(fxObservation(fxService.getHistoricalFxRate.mock.calls[0][1], 99)); await settle(app);
    expect(fxScreens(app).dashboard.monthTotal).toBe(0);
    expect(fxScreens(app).dashboard.coverage).toMatchObject({ total: 0, complete: true });
    expect(fxScreens(app).list.spendingSections).toEqual([]);
    expect(await storage.loadExpenses(storage.LOCAL_USER)).toEqual([]);
    expect(fxService.getHistoricalFxRate).toHaveBeenCalledTimes(1);
  });
});
