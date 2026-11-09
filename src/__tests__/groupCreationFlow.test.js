// Real App callbacks with the existing lightweight hook-harness pattern.
// Native dismissal completion is delivered explicitly so handoff order is tested.
let mockFrame, mockFrames, mockAuthListener, mockLanguage;
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
  Modal: 'Modal', Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView',
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
  enqueueGroupUpsert: jest.fn(), enqueueGroupDelete: jest.fn(), enqueueSplitDelete: jest.fn(),
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
const GroupCreatedSheet = jest.requireActual('../components/GroupCreatedSheet').default;
const CreateGroupScreen = jest.requireActual('../screens/CreateGroupScreen').default;
const SharedSplitForm = jest.requireActual('../screens/SharedSplitForm').default;
const Sheet = require('../components/Sheet').default;
const { Platform } = require('react-native');
const storage = require('../storage');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const sync = require('../sync');
const { deleteAllData } = require('../deleteAllData');
const { groupBalances, computeShares, YOU } = require('../splits');
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
function create(app) {
  app.nodes('SplitBillsScreen')[0].props.onCreateGroup(); app.render();
  app.nodes('CreateGroupScreen')[0].props.onCreate(draft); app.render();
}
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

it.each(['ios', 'web'])('shows standalone success only after Create Group dismisses on %s, preserving the saved group', async (platform) => {
  Platform.OS = platform;
  const app = await mountApp(); create(app);
  expect(app.nodes('CreateGroupScreen')[0].props.visible).toBe(false);
  expect(success(app).visible).toBe(false); expect(detail(app).visible).toBe(false);
  finishCreate(app);
  expect(success(app).visible).toBe(true); expect(detail(app).visible).toBe(false);
  const group = success(app).group;
  expect(group).toMatchObject({ name: draft.name, currency: 'JPY', paymentMethod: 'cash', icon: draft.icon });
  expect(group.members.map(({ name }) => name)).toEqual(draft.members);
  expect(new Set(group.members.map(({ id }) => id)).size).toBe(2);
  await settle(app);
  expect(await storage.loadGroups('alice')).toEqual([group]);
  expect(await storage.loadSplitExpenses('alice')).toEqual([]);
  expect(sync.enqueueGroupUpsert).toHaveBeenCalledTimes(1);
  expect(sync.enqueueGroupUpsert).toHaveBeenCalledWith('alice', group);
  expect(groupBalances(group, [])).toEqual(Object.fromEntries(group.members.map(({ id }) => [id, 0])));
  expect(Object.values(computeShares(100, 'equal', [YOU, ...group.members.map(({ id }) => id)], {}, 'JPY')).reduce((a, b) => a + b, 0)).toBe(100);
});

it('accepts a create only once and ignores a close request while returning to Add Bill', async () => {
  const app = await mountApp();
  app.nodes('TabBar')[0].props.onAdd(); app.render();
  app.nodes('AddEntryScreen')[0].props.onChangeEntryMode('shared'); app.render();
  app.nodes('SharedSplitForm')[0].props.onCreateGroup(); app.render();
  const form = app.nodes('CreateGroupScreen')[0].props;
  form.onCreate(draft); form.onCreate(draft); form.onClose(); app.render();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  expect(app.nodes('SplitBillsScreen')[0].props.groups).toHaveLength(1);
  expect(sync.enqueueGroupUpsert).toHaveBeenCalledTimes(1);
  finishCreate(app);
  const shared = app.nodes('SharedSplitForm')[0], key = shared.key;
  app.nodes('CreateGroupScreen')[0].props.onDismiss(); app.render();
  expect(app.nodes('SharedSplitForm')[0].key).toBe(key);
  expect(shared.props.initialGroupId).toBe(shared.props.groups[0].id);
});

it('opens the existing shared form after success dismissal, selects group defaults, and returns on bill cancel', async () => {
  const app = await mountApp(); create(app); finishCreate(app);
  const group = success(app).group;
  success(app).onAddFirstBill(); app.render();
  expect(success(app).visible).toBe(false);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  success(app).onDismiss(); app.render();
  const formProps = app.nodes('SharedSplitForm')[0].props;
  expect(formProps.lockedGroupId).toBe(group.id);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(true);
  const form = renderComponent(SharedSplitForm, formProps);
  const picker = nodes(form.tree()).find((node) => node.type?.name === 'CurrencyPicker');
  expect(picker.props.value).toBe('JPY');
  formProps.onClose(); app.render();
  expect(detail(app).visible).toBe(true); expect(detail(app).group).toEqual(group);
  expect(app.nodes('SplitBillsScreen')[0].props.groups).toEqual([group]);
});

it.each(['onViewGroup', 'onClose'])('opens Group Detail once after %s and ignores repeated/stale callbacks', async (action) => {
  const app = await mountApp(); create(app); finishCreate(app);
  const original = success(app), group = original.group;
  original[action](); original[action](); original.onAddFirstBill(); app.render();
  expect(detail(app).visible).toBe(false);
  const dismiss = success(app).onDismiss;
  dismiss(); dismiss(); app.render();
  expect(detail(app).group).toEqual(group); expect(detail(app).visible).toBe(true);
  detail(app).onClose(); app.render();
  dismiss(); original.onClose(); original.onAddFirstBill(); app.render();
  expect(detail(app).visible).toBe(false);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  expect(sync.enqueueGroupUpsert).toHaveBeenCalledTimes(1);
});

it.each(['backdrop', 'hardware-back', 'close'])('routes success %s dismissal to Group Detail', async (path) => {
  const app = await mountApp(); create(app); finishCreate(app);
  const content = renderComponent(GroupCreatedSheet, success(app));
  const shell = renderComponent(Sheet, content.tree().props);
  if (path === 'hardware-back') shell.tree().props.onRequestClose();
  else if (path === 'backdrop') shell.nodes('Pressable')[0].props.onPress();
  else content.nodes('Pressable')[0].props.onPress();
  app.render(); success(app).onDismiss(); app.render();
  expect(detail(app).visible).toBe(true);
});

it('continues Android handoffs without relying on an unavailable native onDismiss', async () => {
  Platform.OS = 'android';
  const app = await mountApp(); create(app);
  expect(success(app).visible).toBe(true);
  const content = renderComponent(GroupCreatedSheet, success(app));
  renderComponent(Sheet, content.tree().props).tree().props.onRequestClose(); app.render();
  expect(detail(app).visible).toBe(true); expect(success(app).visible).toBe(false);
});

it('bypasses success when creating from Add Bill and returns with the new group selected', async () => {
  const app = await mountApp();
  app.nodes('TabBar')[0].props.onAdd(); app.render();
  app.nodes('AddEntryScreen')[0].props.onChangeEntryMode('shared'); app.render();
  app.nodes('SharedSplitForm')[0].props.onCreateGroup(); app.render();
  app.nodes('CreateGroupScreen')[0].props.onCreate(draft); app.render();
  expect(success(app).visible).toBe(false);
  finishCreate(app);
  const form = app.nodes('SharedSplitForm')[0].props;
  expect(form.initialGroupId).toBe(form.groups[0].id);
  expect(form.lockedGroupId).toBeNull();
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(true);
  expect(success(app).visible).toBe(false); expect(detail(app).visible).toBe(false);
});

it.each(['closing-create', 'success', 'closing-success'])('invalidates %s callbacks on an account switch, including colliding group IDs', async (phase) => {
  const app = await mountApp(); create(app);
  if (phase !== 'closing-create') finishCreate(app);
  const oldCreate = app.nodes('CreateGroupScreen')[0].props;
  const oldSuccess = success(app), group = app.nodes('SplitBillsScreen')[0].props.groups[0];
  if (phase === 'closing-success') { oldSuccess.onViewGroup(); app.render(); }
  const oldDismiss = success(app).onDismiss;
  await storage.saveSettings('bob', { ...storage.DEFAULT_SETTINGS, onboardingDone: true });
  await storage.saveGroups('bob', [{ ...group, name: 'Bob group' }]);
  mockAuthListener('SIGNED_IN', { user: { id: 'bob' } }); await settle(app);
  oldCreate.onDismiss(); oldDismiss(); oldSuccess.onViewGroup(); oldSuccess.onAddFirstBill(); oldCreate.onCreate(draft); app.render();
  expect(success(app).visible).toBe(false); expect(detail(app).visible).toBe(false);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
  expect(app.nodes('SplitBillsScreen')[0].props.groups.map(({ name }) => name)).toEqual(['Bob group']);
  create(app); finishCreate(app);
  oldSuccess.onClose(); oldDismiss(); app.render();
  expect(success(app).visible).toBe(true);
  expect(success(app).group.name).toBe(draft.name);
});

it('clears success on logout and cannot revive it after logging back in', async () => {
  const app = await mountApp(); create(app); finishCreate(app);
  const old = success(app);
  mockAuthListener('SIGNED_OUT', null); await settle(app);
  expect(app.nodes('GroupCreatedSheet')).toEqual([]);
  old.onViewGroup(); old.onDismiss();
  mockAuthListener('SIGNED_IN', { user: { id: 'alice' } }); await settle(app);
  expect(success(app).visible).toBe(false); expect(detail(app).visible).toBe(false);
});

it.each(['before-success', 'shown', 'closing'])('ignores a deleted group %s', async (phase) => {
  const app = await mountApp(); create(app);
  if (phase !== 'before-success') finishCreate(app);
  const old = success(app), group = app.nodes('SplitBillsScreen')[0].props.groups[0];
  if (phase === 'closing') { old.onAddFirstBill(); app.render(); }
  const dismiss = success(app).onDismiss, createDismiss = app.nodes('CreateGroupScreen')[0].props.onDismiss;
  app.nodes('GroupDetailScreen')[0].props.onDeleteGroup(group.id); app.render();
  old.onViewGroup(); dismiss(); createDismiss(); app.render();
  expect(success(app).visible).toBe(false); expect(detail(app).visible).toBe(false);
  expect(app.nodes('AddExpenseModal')[0].props.visible).toBe(false);
});

it('clears success after an account-data reset without performing another save', async () => {
  const app = await mountApp(); create(app); finishCreate(app);
  const old = success(app);
  deleteAllData.mockImplementationOnce(async ({ resetState }) => resetState());
  await app.nodes('AccountScreen')[0].props.onDeleteAllData(); await settle(app);
  old.onViewGroup(); old.onAddFirstBill(); old.onDismiss(); app.render();
  expect(app.nodes('GroupCreatedSheet')).toEqual([]);
  expect(app.nodes('GroupDetailScreen')).toEqual([]);
  expect(app.nodes('OnboardingScreen')).toHaveLength(1);
  expect(sync.enqueueGroupUpsert).toHaveBeenCalledTimes(1);
});

it.each(['en', 'zh', 'es'])('localizes the compact success sheet in %s with accessible action targets', (language) => {
  mockLanguage = language;
  const props = { visible: true, group: { ...draft, members: draft.members.map((name, id) => ({ id, name })) }, onClose: jest.fn(), onAddFirstBill: jest.fn(), onViewGroup: jest.fn(), onDismiss: jest.fn() };
  const sheet = renderComponent(GroupCreatedSheet, props);
  expect(textOf(sheet.tree())).toContain(translate(language, 'split.groupCreated'));
  expect(textOf(sheet.tree())).toContain(translate(language, 'split.groupCreatedSubtitle'));
  expect(sheet.nodes('Icon').find((node) => node.props.name === 'tick-02').props.size).toBe(20);
  expect(textOf(sheet.tree())).toContain(draft.name);
  expect(textOf(sheet.tree())).toContain('JPY');
  expect(textOf(sheet.tree())).toContain(translate(language, 'split.memberCount', { count: 2 }));
  const buttons = sheet.nodes('Pressable');
  expect(buttons[0].props.style.width).toBeGreaterThanOrEqual(44);
  for (const button of buttons.slice(1)) expect(button.props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
  buttons[1].props.onPress(); buttons[2].props.onPress();
  expect(props.onAddFirstBill).toHaveBeenCalledTimes(1); expect(props.onViewGroup).toHaveBeenCalledTimes(1);
  const shell = renderComponent(Sheet, sheet.tree().props);
  shell.tree().props.onDismiss(); expect(props.onDismiss).toHaveBeenCalledTimes(1);
});

it('forwards Create Group dismissal completion without changing form validation', () => {
  const onDismiss = jest.fn(), onCreate = jest.fn();
  const form = renderComponent(CreateGroupScreen, { visible: true, defaultCurrency: 'JPY', onDismiss, onCreate });
  form.nodes('Modal')[0].props.onDismiss(); expect(onDismiss).toHaveBeenCalledTimes(1);
  const button = form.nodes('Pressable').find((node) => textOf(node) === translate('en', 'split.createGroup'));
  expect(button.props.disabled).toBe(true); button.props.onPress(); expect(onCreate).not.toHaveBeenCalled();
});
