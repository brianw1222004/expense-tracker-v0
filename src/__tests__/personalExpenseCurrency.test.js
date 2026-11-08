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
  const render = () => {
    do {
      mockFrame = frame; frame.index = 0; frame.effects = []; frame.dirty = false;
      frame.tree = component(props);
      frame.effects.forEach((effect) => effect());
    } while (frame.dirty);
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
  cloud.isSupabaseConfigured = true;
  sync.syncWithServer.mockReset().mockResolvedValue(null);
  sync.enqueueExpenseUpsert.mockReset().mockResolvedValue(undefined);
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, displayCurrency: 'TWD', onboardingDone: true });
});
afterEach(() => {
  for (const frame of mockFrames) for (const hook of frame.hooks) hook?.cleanup?.();
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
