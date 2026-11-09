// Exercise real App routing and Split Bills touch targets with the established hook harness.
let mockFrame, mockFrames, mockAuthListener, mockLanguage;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: (fn) => fn(), memo: (component) => component,
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
    const frame = mockFrame, index = frame.index++, previous = frame.hooks[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      frame.effects.push(() => { previous?.cleanup?.(); frame.hooks[index] = { deps, cleanup: effect() }; });
    }
  },
}));
jest.mock('react/jsx-runtime', () => ({
  jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'Fragment',
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (values) => values.web ?? values.default },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AccessibilityInfo: { announceForAccessibility: jest.fn() },
  Animated: { View: 'AnimatedView', Value: class { setValue() {} interpolate() { return 0; } }, timing: () => ({ start() {} }) },
  Keyboard: { dismiss: jest.fn() },
  Modal: 'Modal', Pressable: 'Pressable', View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 12 }),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect' }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: async () => {}, hideAsync: async () => {} }));
jest.mock('expo-haptics', () => ({ NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock('../../assets/fonts/Arimo-Medium.ttf', () => 1);
jest.mock('../../assets/fonts/LiberationSans-Bold.ttf', () => 2);
jest.mock('../icons', () => ({ HIcon: 'Icon' }));
jest.mock('../confirm', () => ({ confirmDestructive: jest.fn(async () => true) }));
jest.mock('../i18n', () => {
  const real = jest.requireActual('../i18n.js');
  return { ...real, useT: () => (key, vars) => real.translate(mockLanguage, key, vars) };
});
jest.mock('../useTabSlide', () => () => ({ tab: 'split', changeTab: jest.fn(), screenStyle: () => ({}), swipeHandlers: {} }));
jest.mock('../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: async () => ({ data: { session: { user: { id: 'alice' } } } }),
    onAuthStateChange: (listener) => { mockAuthListener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
  } },
}));
jest.mock('../sync', () => ({
  ...jest.requireActual('../sync'), syncWithServer: jest.fn(async () => null),
  enqueueGroupUpsert: jest.fn(), enqueueGroupDelete: jest.fn(), enqueueSplitDelete: jest.fn(), enqueueSplitUpsert: jest.fn(),
}));
jest.mock('../deleteAllData', () => ({ deleteAllData: jest.fn() }));
jest.mock('../fxRateService', () => ({
  ...jest.requireActual('../fxRateService'), getHistoricalFxRate: jest.fn(async () => ({ status: 'unavailable' })),
}));
for (const name of ['DashboardScreen', 'AddEntryScreen', 'ExpenseListScreen', 'AccountScreen', 'InsightScreen',
  'SplitBillsScreen', 'GroupDetailScreen', 'CreateGroupScreen', 'SharedSplitForm', 'BudgetScreen', 'AuthScreen', 'OnboardingScreen']) {
  jest.doMock(`../screens/${name}`, () => name);
}
for (const name of ['TabBar', 'AddExpenseModal', 'ErrorBoundary', 'RewardCheck', 'HeaderGlow', 'GroupCreatedSheet']) {
  jest.doMock(`../components/${name}`, () => name);
}
const App = require('../../App').default;
const SharedSplitForm = jest.requireActual('../screens/SharedSplitForm').default;
const { Platform } = require('react-native');
const storage = require('../storage');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const sync = require('../sync');
const { deleteAllData } = require('../deleteAllData');
const { YOU } = require('../splits');
const { translate } = require('../i18n.js');
const draft = { name: 'Tokyo trip', currency: 'JPY', members: ['Ana', 'Ben'], paymentMethod: 'cash', icon: 'airplane-01' };
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props.children)] : [];
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join('') : node == null ? '' : typeof node === 'object' ? textOf(node.props.children) : String(node);
function renderComponent(component, props = {}) {
  const frame = { hooks: [], index: 0, effects: [], dirty: false, tree: null };
  mockFrames.push(frame);
  const render = () => {
    do {
      mockFrame = frame; frame.index = 0; frame.effects = []; frame.dirty = false;
      frame.tree = component(props); frame.effects.forEach((effect) => effect());
    } while (frame.dirty);
  };
  render();
  return { props, render, tree: () => frame.tree, nodes: (type) => nodes(frame.tree).filter((node) => node.type === type) };
}
async function settle(app) { for (let i = 0; i < 4; i++) { await new Promise((resolve) => setImmediate(resolve)); app.render(); } }
async function mountApp() {
  const root = renderComponent(App);
  const app = renderComponent(root.tree().props.children.type); await settle(app); return app;
}
const success = (app) => app.nodes('GroupCreatedSheet')[0].props;
const detail = (app) => app.nodes('GroupDetailScreen')[0].props;
function finishCreate(app) { app.nodes('CreateGroupScreen')[0].props.onDismiss(); app.render(); }
beforeEach(async () => {
  mockFrames = []; mockLanguage = 'en'; global.__DEV__ = false; Platform.OS = 'web';
  jest.clearAllMocks(); sync.syncWithServer.mockReset().mockResolvedValue(null);
  await AsyncStorage.clear();
  await storage.saveSettings('alice', { ...storage.DEFAULT_SETTINGS, onboardingDone: true });
});
afterEach(() => {
  for (const frame of mockFrames) for (const hook of frame.hooks) hook?.cleanup?.();
  jest.restoreAllMocks(); delete global.__DEV__;
});



const SplitBillsScreen = jest.requireActual('../screens/SplitBillsScreen').default;
const OptionPicker = require('../components/OptionPicker').default;
const CurrencyPicker = require('../components/CurrencyPicker').default;
const AnchorMenu = require('../components/AnchorMenu').default;
const { BackHandler } = require('react-native');
const { confirmDestructive } = require('../confirm');
const { overallBalance, splitMonthGroupSummaries } = require('../splits');
const { getAllCategories } = require('../categories');
const { formatMoney } = require('../format');
const { convert } = require('../currency');
const trip = { id: 'trip', name: 'Tokyo', currency: 'JPY', paymentMethod: 'cash', members: [{ id: 'ana', name: 'Ana' }] };
const oldGroup = { id: 'old-group', name: 'No bills this month', currency: 'EUR', members: [] };
const bill = { id: 'bill', groupId: trip.id, description: 'Lunch', amount: 20, currency: 'USD', category: 'food',
  paidBy: YOU, mode: 'percentage', shares: { [YOU]: 12, ana: 8 }, meta: { percentages: { [YOU]: 60, ana: 40 } },
  createdAt: new Date(2026, 9, 19, 12).getTime() };
const settlement = { id: 'payment', groupId: trip.id, settlement: true, amount: 2, currency: 'JPY',
  fromMember: 'ana', toMember: YOU, createdAt: bill.createdAt };
const chooser = (app) => app.nodes(OptionPicker)[0].props;
const main = (app) => app.nodes('SplitBillsScreen')[0].props;
const addForm = (app) => app.nodes('SharedSplitForm').find((node) => !node.props.editBill);
const editForm = (app) => app.nodes('SharedSplitForm').find((node) => node.props.editBill);
async function seededApp() {
  await storage.saveGroups('alice', [trip, oldGroup]);
  await storage.saveSplitExpenses('alice', [bill, settlement]);
  return mountApp();
}
function quickAdd(app, groupId = trip.id) {
  main(app).onAddBill(); app.render();
  chooser(app).onSelect(groupId); app.render();
  chooser(app).onDismiss(); app.render();
  return addForm(app).props;
}
const newBill = () => ({ groupId: trip.id, description: 'Dinner', amount: 100, currency: 'JPY', category: 'food',
  paidBy: YOU, mode: 'equal', shares: { [YOU]: 50, ana: 50 }, createdAt: bill.createdAt });
const input = (form, key) => form.nodes('TextInput').find((node) => node.props.accessibilityLabel === translate('en', key));
const save = (form) => form.nodes('Pressable').find((node) => textOf(node) === translate('en', form.props.editBill ? 'split.saveChanges' : 'split.addBill'));
function chooseMenu(form, label, value) {
  form.nodes('Pressable').find((node) => node.props.accessibilityLabel === translate('en', label)).props.onPress();
  form.render(); form.nodes(AnchorMenu)[0].props.onSelect(value); form.render();
}

it('opens one group chooser containing all current groups regardless of the browsing month', async () => {
  const app = await seededApp();
  main(app).onShiftMonth(-12); app.render();
  const open = main(app).onAddBill; open(); open(); app.render();
  expect(chooser(app).visible).toBe(true);
  expect(chooser(app).options.map(({ id }) => id)).toEqual([trip.id, oldGroup.id, '__new_group__']);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  const close = chooser(app).onClose; close(); close(); app.render();
  expect(chooser(app).visible).toBe(false);
  expect(detail(app).visible).toBe(false);
  const picker = renderComponent(OptionPicker, { visible: true, title: 'Choose', options: [], onDismiss: jest.fn() });
  picker.tree().props.onDismiss(); expect(picker.props.onDismiss).toHaveBeenCalledTimes(1);
});

it('waits for chooser dismissal, opens the selected group, and consumes repeated callbacks once', async () => {
  const app = await seededApp(); main(app).onAddBill(); app.render();
  const old = chooser(app); old.onSelect(oldGroup.id); old.onSelect(trip.id); app.render();
  expect(chooser(app).visible).toBe(false);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  const dismiss = chooser(app).onDismiss; dismiss(); dismiss(); app.render();
  const props = addForm(app).props;
  expect(props.initialGroupId).toBe(oldGroup.id);
  const form = renderComponent(SharedSplitForm, props);
  expect(form.nodes(CurrencyPicker)[0].props.value).toBe('EUR');
  expect(props.lockedGroupId).toBeNull();
  props.onClose(); app.render();
  dismiss(); old.onSelect(trip.id); app.render();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  expect(detail(app).visible).toBe(false);
});

it('offers Create Group with empty history and returns directly to Add Bill, preserving Split Bills origin', async () => {
  const app = await mountApp(); main(app).onAddBill(); app.render();
  expect(chooser(app).options.map(({ id }) => id)).toEqual(['__new_group__']);
  chooser(app).onSelect('__new_group__'); app.render();
  chooser(app).onDismiss(); app.render();
  expect(app.nodes('CreateGroupScreen')[0].props.visible).toBe(true);
  app.nodes('CreateGroupScreen')[0].props.onCreate(draft); app.render(); finishCreate(app);
  expect(success(app).visible).toBe(false);
  const props = addForm(app).props;
  expect(props.initialGroupId).toBe(props.groups[0].id);
  props.onClose(); app.render();
  expect(detail(app).visible).toBe(false);
  expect(main(app).groups).toHaveLength(1);
});

it.each(['split', 'group'])('preserves %s-origin add returns for save, cancel, and hardware back', async (origin) => {
  const app = await seededApp();
  const open = () => {
    if (origin === 'split') return quickAdd(app);
    detail(app).onAddBill(trip.id); app.render(); return addForm(app).props;
  };
  let props = open();
  const submit = props.onAdd;
  expect(submit(newBill())).toBe(true);
  expect(submit(newBill())).toBe(false);
  await settle(app);
  expect(detail(app).visible).toBe(origin === 'group');
  if (origin === 'group') expect(detail(app).group.id).toBe(trip.id);
  expect(sync.enqueueSplitUpsert).toHaveBeenCalledTimes(1);
  props = open(); props.onClose(); app.render();
  expect(detail(app).visible).toBe(origin === 'group');
  Platform.OS = 'android';
  props = open();
  const back = BackHandler.addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)[1];
  expect(back()).toBe(true); app.render();
  expect(detail(app).visible).toBe(origin === 'group');
  expect(await storage.loadSplitExpenses('alice')).toEqual(expect.arrayContaining([bill, settlement]));
});

it.each(['split', 'group'])('preserves %s-origin edit returns for save, cancel, delete, and hardware back', async (origin) => {
  const app = await seededApp();
  const open = () => {
    if (origin === 'split') main(app).onEditBill(bill.id);
    else detail(app).onEditBill(main(app).splitExpenses.find(({ id }) => id === bill.id));
    app.render(); return editForm(app).props;
  };
  let props = open();
  expect(props.editBill).toEqual(bill);
  expect(props.onSave({ ...bill, description: 'Lunch edited' })).toBe(true);
  expect(props.onSave({ ...bill, description: 'Duplicate' })).toBe(false);
  await settle(app);
  expect(detail(app).visible).toBe(origin === 'group');
  const edited = (await storage.loadSplitExpenses('alice')).find(({ id }) => id === bill.id);
  expect(edited).toEqual({ ...bill, description: 'Lunch edited' });
  expect(sync.enqueueSplitUpsert).toHaveBeenCalledTimes(1);
  props = open(); props.onClose(); app.render();
  expect(detail(app).visible).toBe(origin === 'group');
  Platform.OS = 'android'; props = open();
  BackHandler.addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)[1](); app.render();
  expect(detail(app).visible).toBe(origin === 'group');
  props = open(); expect(props.onDelete(bill.id)).toBe(true); app.render(); await settle(app);
  expect(detail(app).visible).toBe(origin === 'group');
  expect(await storage.loadSplitExpenses('alice')).toEqual([settlement]);
});

it('resolves direct editing from current saved records, rejecting stale IDs and settlements', async () => {
  const app = await seededApp();
  main(app).onEditBill('missing'); main(app).onEditBill(settlement.id); app.render();
  expect(editForm(app)).toBeUndefined();
  const stalePreview = { ...bill, amount: 999, currency: 'EUR', shares: {} };
  main(app).onEditBill(stalePreview.id); app.render();
  expect(editForm(app).props.editBill).toEqual(bill);
  expect(detail(app).visible).toBe(false);
  editForm(app).props.onClose(); app.render();
  main(app).onAddBill(); app.render();
  const old = chooser(app);
  detail(app).onDeleteGroup(trip.id); app.render();
  old.onSelect(trip.id); app.render(); chooser(app).onDismiss(); app.render();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  expect(editForm(app)).toBeUndefined();
});

it('does not open a group removed between choosing and native dismissal', async () => {
  const app = await seededApp(); main(app).onAddBill(); app.render();
  chooser(app).onSelect(trip.id); app.render();
  const finish = chooser(app).onDismiss;
  detail(app).onDeleteGroup(trip.id); app.render();
  finish(); app.render();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  expect(detail(app).visible).toBe(false);
});

it.each(['chooser', 'add', 'edit', 'create'])('clears %s navigation on switching accounts and rejects colliding/stale callbacks', async (phase) => {
  const app = await seededApp(), oldMain = main(app);
  let oldChooser, oldForm;
  if (phase === 'chooser') { oldMain.onAddBill(); app.render(); oldChooser = chooser(app); }
  else if (phase === 'edit') { oldMain.onEditBill(bill.id); app.render(); oldForm = editForm(app).props; }
  else {
    oldForm = quickAdd(app);
    if (phase === 'create') { oldForm.onCreateGroup(); app.render(); }
  }
  await storage.saveSettings('bob', { ...storage.DEFAULT_SETTINGS, onboardingDone: true });
  await storage.saveGroups('bob', [trip]);
  await storage.saveSplitExpenses('bob', [{ ...bill, description: 'Bob data' }]);
  mockAuthListener('SIGNED_IN', { user: { id: 'bob' } }); await settle(app);
  oldMain.onAddBill(); oldMain.onEditBill(bill.id); oldMain.onOpenGroup(trip.id);
  oldChooser?.onSelect(trip.id); oldChooser?.onDismiss(); oldForm?.onClose();
  oldForm?.onAdd?.(newBill()); oldForm?.onSave?.(bill); oldForm?.onDelete?.(bill.id); app.render();
  expect(chooser(app).visible).toBe(false); expect(detail(app).visible).toBe(false);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  expect(editForm(app)).toBeUndefined();
  expect(app.nodes('CreateGroupScreen')[0].props.visible).toBe(false);
  expect(await storage.loadSplitExpenses('bob')).toEqual([{ ...bill, description: 'Bob data' }]);
});

it('ignores an edit delete-confirmation that resolves after switching accounts', async () => {
  const app = await seededApp(); main(app).onEditBill(bill.id); app.render();
  const form = renderComponent(SharedSplitForm, editForm(app).props);
  let confirm;
  confirmDestructive.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
  const deleting = form.nodes('Pressable').find((node) => textOf(node) === translate('en', 'split.deleteBill')).props.onPress();
  await storage.saveSettings('bob', { ...storage.DEFAULT_SETTINGS, onboardingDone: true });
  await storage.saveGroups('bob', [trip]); await storage.saveSplitExpenses('bob', [bill]);
  mockAuthListener('SIGNED_IN', { user: { id: 'bob' } }); await settle(app);
  confirm(true); await deleting; await settle(app);
  expect(await storage.loadSplitExpenses('bob')).toEqual([bill]);
  expect(sync.enqueueSplitDelete).not.toHaveBeenCalled();
});

it('clears chooser and form navigation on logout and account-data reset', async () => {
  const app = await seededApp(); main(app).onAddBill(); app.render();
  const old = chooser(app);
  mockAuthListener('SIGNED_OUT', null); await settle(app);
  old.onSelect(trip.id); old.onDismiss();
  mockAuthListener('SIGNED_IN', { user: { id: 'alice' } }); await settle(app);
  expect(chooser(app).visible).toBe(false);
  quickAdd(app);
  deleteAllData.mockImplementationOnce(async ({ resetState }) => resetState());
  await app.nodes('AccountScreen')[0].props.onDeleteAllData(); await settle(app);
  expect(app.nodes('SharedSplitForm')).toEqual([]);
});

it('retains the same draft across Create Group and resets group-dependent inputs before saving', async () => {
  const app = await seededApp(), props = quickAdd(app), key = addForm(app).key;
  const form = renderComponent(SharedSplitForm, props);
  input(form, 'split.amount').props.onChangeText('100');
  input(form, 'split.description').props.onChangeText('Draft dinner'); form.render();
  chooseMenu(form, 'split.paidBy', 'ana');
  chooseMenu(form, 'split.splitMethod', 'custom');
  const oldInputs = form.nodes('TextInput').filter((node) => node.props.accessibilityLabel?.endsWith('Amount') && node !== input(form, 'split.amount'));
  for (const field of oldInputs) field.props.onChangeText('50');
  form.render();
  props.onCreateGroup(); app.render();
  app.nodes('CreateGroupScreen')[0].props.onCreate(draft); app.render(); finishCreate(app);
  expect(addForm(app).key).toBe(key);
  Object.assign(form.props, addForm(app).props); form.render();
  expect(input(form, 'split.amount').props.value).toBe('100');
  expect(input(form, 'split.description').props.value).toBe('Draft dinner');
  expect(form.nodes(CurrencyPicker)[0].props.value).toBe('JPY');
  expect(save(form).props.disabled).toBe(true); // Old custom allocations are not reused.
  chooseMenu(form, 'split.splitMethod', 'equal');
  expect(save(form).props.disabled).toBe(false);
  await save(form).props.onPress(); await settle(app);
  const saved = (await storage.loadSplitExpenses('alice')).find(({ description }) => description === 'Draft dinner');
  expect(saved.groupId).not.toBe(trip.id);
  expect(saved.paidBy).toBe(YOU);
  expect(saved.shares.ana).toBeUndefined();
  expect(Object.values(saved.shares).reduce((sum, amount) => sum + amount, 0)).toBe(100);
  expect(saved.amount).toBe(100);
  expect(detail(app).visible).toBe(false); expect(success(app).visible).toBe(false);
});

it('retains a canceled group-creation draft and ignores callbacks from its suspended/previous form', async () => {
  const app = await seededApp(), props = quickAdd(app), key = addForm(app).key;
  const staleClose = props.onClose, staleAdd = props.onAdd;
  const form = renderComponent(SharedSplitForm, props);
  input(form, 'split.description').props.onChangeText('Keep this draft'); form.render();
  props.onCreateGroup(); app.render();
  expect(props.onAdd(newBill())).toBe(false);
  props.onClose(); app.render();
  expect(app.nodes('CreateGroupScreen')[0].props.visible).toBe(true);
  app.nodes('CreateGroupScreen')[0].props.onClose(); app.render();
  expect(addForm(app).key).toBe(key);
  Object.assign(form.props, addForm(app).props); form.render();
  expect(input(form, 'split.description').props.value).toBe('Keep this draft');
  staleClose(); expect(staleAdd(newBill())).toBe(false); app.render();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(true);
  expect(sync.enqueueSplitUpsert).not.toHaveBeenCalled();
});

it('closes an active editor safely if its group is removed', async () => {
  const app = await seededApp(); main(app).onEditBill(bill.id); app.render();
  const old = editForm(app).props;
  detail(app).onDeleteGroup(trip.id); app.render();
  expect(editForm(app)).toBeUndefined();
  expect(old.onSave(bill)).toBe(false);
  old.onClose(); app.render();
  expect(detail(app).visible).toBe(false);
});

it('keeps a rejected shared submission retryable and prevents accepted duplicates', () => {
  const onAdd = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
  const form = renderComponent(SharedSplitForm, { groups: [trip], displayCurrency: 'USD', onAdd, categories: getAllCategories() });
  input(form, 'split.amount').props.onChangeText('100'); form.render();
  save(form).props.onPress(); save(form).props.onPress(); save(form).props.onPress();
  expect(onAdd).toHaveBeenCalledTimes(2);
});

it.each(['en', 'zh', 'es'])('renders independent accessible add, edit, and group targets in %s with unchanged summaries', (language) => {
  mockLanguage = language;
  const bills = [bill, { ...bill, id: 'second', description: 'Second', createdAt: bill.createdAt - 1 },
    { ...bill, id: 'third', createdAt: bill.createdAt - 2 }, settlement];
  const groups = [trip, oldGroup], summary = overallBalance(groups, bills, 'USD');
  const snapshot = JSON.stringify({ groups, bills, summary });
  const props = { groups, splitExpenses: bills, summary, displayCurrency: 'USD', monthKey: '2026-10',
    currentMonthKey: '2026-11', onAddBill: jest.fn(), onEditBill: jest.fn(), onOpenGroup: jest.fn(), onCreateGroup: jest.fn() };
  const screen = renderComponent(SplitBillsScreen, props);
  const add = screen.nodes('Pressable').find((node) => node.props.accessibilityLabel === translate(language, 'split.addBill'));
  expect(add.props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
  add.props.onPress(); expect(props.onAddBill).toHaveBeenCalledTimes(1);
  const groupNode = nodes(screen.tree()).find((node) => node.type?.name === 'GroupCard' && node.props.group.id === trip.id);
  const card = renderComponent(groupNode.type, groupNode.props);
  expect(card.tree().type).toBe('View');
  const edit = card.nodes('Pressable').filter((node) => node.props.accessibilityLabel?.startsWith(translate(language, 'split.editBillLabel', { name: '' })));
  expect(edit).toHaveLength(2);
  expect(edit[0].props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
  edit[0].props.onPress();
  expect(props.onEditBill).toHaveBeenCalledWith(bill.id);
  expect(props.onOpenGroup).not.toHaveBeenCalled();
  for (const button of card.nodes('Pressable')) expect(nodes(button.props.children).some((node) => node.type === 'Pressable')).toBe(false);
  card.nodes('Pressable').find((node) => node.props.accessibilityLabel === trip.name).props.onPress();
  expect(props.onOpenGroup).toHaveBeenCalledWith(trip.id);
  expect(groupNode.props.totalSpent).toBe(splitMonthGroupSummaries(groups, bills, '2026-10', 'USD')[0].totalSpent);
  expect(JSON.stringify({ groups, bills, summary })).toBe(snapshot);
});

const summaryCases = ['en', 'zh', 'es'].flatMap((language) =>
  ['owed', 'owing', 'settled'].flatMap((balance) => [1, 2].map((count) => ({ language, balance, count })))
);
it.each(summaryCases)('exposes the visible financial summary and navigation for %j', ({ language, balance, count }) => {
  mockLanguage = language;
  const bills = Array.from({ length: count }, (_, i) => ({
    ...bill, id: `summary-${i}`, paidBy: balance === 'owing' ? 'ana' : YOU,
    shares: balance === 'settled' ? { [YOU]: 20, ana: 0 } : { [YOU]: 10, ana: 10 },
  }));
  const props = { groups: [trip], splitExpenses: bills, summary: overallBalance([trip], bills, 'EUR'),
    displayCurrency: 'EUR', monthKey: '2026-10', currentMonthKey: '2026-11',
    onOpenGroup: jest.fn(), onEditBill: jest.fn() };
  const screen = renderComponent(SplitBillsScreen, props);
  const groupNode = nodes(screen.tree()).find((node) => node.type?.name === 'GroupCard');
  const card = renderComponent(groupNode.type, groupNode.props);
  const target = card.nodes('Pressable').find((node) => typeof node.props.style === 'function' &&
    node.props.style({ pressed: false })[0] === groupNode.props.styles.groupTotalCol);
  const label = target.props.accessibilityLabel;
  const spendingText = formatMoney(convert(20 * count, 'USD', 'EUR'), 'EUR');
  const countText = translate(language, count === 1 ? 'split.billCountOne' : 'split.billCount', { count });
  const balanceText = balance === 'settled' ? translate(language, 'split.settled')
    : translate(language, balance === 'owed' ? 'split.owesYouShort' : 'split.youOweShort', {
      amount: formatMoney(convert(10 * count, 'USD', 'EUR'), 'EUR'),
    });
  expect(label).toContain(trip.name);
  expect(label).toContain(`${translate(language, 'split.spentThisMonth')} ${spendingText} EUR`);
  expect(label).toContain(countText);
  expect(label).toContain(balanceText);
  // The spoken summary reuses the visible text rather than a separate valuation.
  for (const text of [spendingText, countText, balanceText]) expect(textOf(target)).toContain(text);
  expect(target.props.accessibilityRole).toBe('button');
  target.props.onPress();
  expect(props.onOpenGroup).toHaveBeenCalledTimes(1);
  expect(props.onOpenGroup).toHaveBeenCalledWith(trip.id);
  expect(props.onEditBill).not.toHaveBeenCalled();
});

it.each(['en', 'zh', 'es'])('announces localized zero spending, zero bills, and settled state in %s', (language) => {
  mockLanguage = language;
  const screen = renderComponent(SplitBillsScreen, { groups: [trip], splitExpenses: [],
    summary: overallBalance([trip], [], 'USD'), displayCurrency: 'USD', monthKey: '2026-10' });
  const groupNode = nodes(screen.tree()).find((node) => node.type?.name === 'GroupCard');
  const card = renderComponent(groupNode.type, groupNode.props);
  const label = card.nodes('Pressable').find((node) => typeof node.props.style === 'function' &&
    node.props.style({ pressed: false })[0] === groupNode.props.styles.groupTotalCol).props.accessibilityLabel;
  expect(label).toContain(`${formatMoney(0, 'USD')} USD`);
  expect(label).toContain(translate(language, 'split.billCount', { count: 0 }));
  expect(label).toContain(translate(language, 'split.settled'));
});

it('keeps the all-time group balance accessible when the browsed month has no bills', () => {
  const screen = renderComponent(SplitBillsScreen, { groups: [trip], splitExpenses: [bill],
    summary: overallBalance([trip], [bill], 'USD'), displayCurrency: 'USD', monthKey: '2026-11' });
  const groupNode = nodes(screen.tree()).find((node) => node.type?.name === 'GroupCard');
  const card = renderComponent(groupNode.type, groupNode.props);
  const target = card.nodes('Pressable').find((node) => typeof node.props.style === 'function' &&
    node.props.style({ pressed: false })[0] === groupNode.props.styles.groupTotalCol);
  expect(target.props.accessibilityLabel).toContain(`${formatMoney(0, 'USD')} USD`);
  expect(target.props.accessibilityLabel).toContain(translate('en', 'split.billCount', { count: 0 }));
  const netText = translate('en', 'split.owesYouShort', { amount: formatMoney(8, 'USD') });
  expect(textOf(target)).toContain(netText);
  expect(target.props.accessibilityLabel).toContain(netText);
});

