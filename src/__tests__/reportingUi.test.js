let mockFrame, mockDirty, mockEffects, mockLanguage = 'en';
jest.mock('react', () => ({
  ...jest.requireActual('react'), memo: (component) => component, useMemo: (fn) => fn(), useCallback: (fn) => fn,
  useState(initial) {
    const frame = mockFrame, index = frame.index++;
    frame.hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [frame.hooks[index].value, (value) => {
      const next = typeof value === 'function' ? value(frame.hooks[index].value) : value;
      mockDirty ||= !Object.is(next, frame.hooks[index].value); frame.hooks[index].value = next;
    }];
  },
  useRef(initial) { const f = mockFrame, i = f.index++; return f.hooks[i] ??= { current: initial }; },
  useEffect(effect, deps) {
    const f = mockFrame, i = f.index++, old = f.hooks[i];
    if (!old || deps.some((value, index) => value !== old.deps[index])) mockEffects.push(() => {
      old?.cleanup?.(); f.hooks[i] = { deps, cleanup: effect() };
    });
  },
}));
jest.mock('react/jsx-runtime', () => ({ jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'Fragment' }));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Animated: { View: 'AnimatedView', ValueXY: class { setValue() {} getTranslateTransform() { return []; } },
    event: () => () => {}, spring: () => ({ start: (done) => done?.() }) },
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Line: 'Line', Text: 'SvgText' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('../theme', () => ({
  useTheme: () => ({ colors: { accent: '#123456', textPrimary: '#111111', textMuted: '#666666', background: '#ffffff', border: '#eeeeee', card: '#ffffff', success: 'green', warning: 'orange', danger: 'red', icon: '#666666' } }),
  fonts: { regular: 'regular', bold: 'bold', numBold: 'numBold', numRegular: 'numRegular' },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16 }, cardShadow: {},
}));
jest.mock('../i18n', () => ({ ...jest.requireActual('../i18n.js'),
  useT: () => (key, values) => jest.requireActual('../i18n.js').translate(mockLanguage, key, values), useLanguage: () => mockLanguage,
}));
jest.mock('../icons', () => ({ HIcon: 'Icon' }));
jest.mock('../components/MonthSelector', () => 'MonthSelector');
jest.mock('../components/HeaderGlow', () => 'HeaderGlow');
jest.mock('../components/EmptyState', () => 'EmptyState');
jest.mock('../components/AddCategoryModal', () => 'AddCategoryModal');
jest.mock('../components/TabBar', () => ({ TAB_BAR_HEIGHT: 64 }));

const ExpenseRow = require('../components/ExpenseRow').default;
const ExpenseList = require('../screens/ExpenseListScreen').default;
const Dashboard = require('../screens/DashboardScreen').default;
const Insight = require('../screens/InsightScreen').default;
const { BudgetBar } = require('../screens/InsightScreen');
const CategorySummary = require('../components/CategorySummaryCard').default;
const ReportingFxStatus = require('../components/ReportingFxStatus').default;
const { translate } = require('../i18n');
const { getAllCategories, getRegularAll, getExternalAll, getCategoryLabel } = require('../categories');
const { deriveViewData } = require('../derive');
const { deriveSharedSpendingActivity } = require('../money');
const { resolveSpendingEdit } = require('../spendingActivity');
const { resolveReportingFx, summarizeReportingFx } = require('../reportingFx');
const { reportingRows } = require('../useReportingFx');
const { useTheme } = require('../theme');

const date = new Date(2026, 9, 19, 12).getTime();
const personal = (patch = {}) => ({ id: 'p', amount: 20, currency: 'USD', category: 'food', note: 'foodtest', createdAt: date, ...patch });
const historical = (row, target) => ({ status: 'available', quote: {
  baseCurrency: row.currency, quoteCurrency: target, rate: 32.426,
  effectiveDate: '2026-10-19', sourceType: 'historical', provider: 'frankfurter-v2:BOC', retrievedAt: '2026-10-20T12:00:00Z',
}, provenance: { source: 'BOC' }, cache: { stale: false } });
function fixture(expenses = [personal()], bills = [], lookup = historical, currency = 'TWD') {
  const shared = deriveSharedSpendingActivity(bills), entries = {};
  for (const row of reportingRows(expenses, shared)) entries[row.rowKey] = resolveReportingFx(row, currency, lookup(row, currency));
  const snapshot = { currency, entries };
  return deriveViewData(expenses, currency, 'en', [], new Date(2026, 9, 20), shared, snapshot);
}
function render(component, initialProps) {
  const frames = new Map(); let tree;
  const props = { ...initialProps };
  function expand(node, key) {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((child, i) => expand(child, key + '/' + i));
    if (typeof node.type === 'function') {
      if (frames.get(key)?.type !== node.type) frames.set(key, { type: node.type, hooks: [], index: 0 });
      mockFrame = frames.get(key); mockFrame.index = 0;
      return expand(node.type(node.props), key + '/render');
    }
    return { ...node, props: { ...node.props,
      children: node.type === 'Modal' && !node.props.visible ? null : expand(node.props?.children, key + '/children') } };
  }
  function update(next = {}) {
    Object.assign(props, next); let rounds = 0;
    do {
      if (++rounds > 20) throw new Error('Render loop');
      mockDirty = false; mockEffects = [];
      tree = expand({ type: component, props }, 'root'); mockEffects.forEach((effect) => effect());
    } while (mockDirty);
    return tree;
  }
  update();
  return { update, tree: () => tree, nodes: (type) => nodes(tree).filter((node) => node.type === type) };
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return node == null ? '' : typeof node === 'object' ? text(node.props?.children) : String(node);
}
const t = (key) => translate(mockLanguage, key);
const coverage = (amount, status = 'historical') => summarizeReportingFx([{ currency: 'TWD', status, amount, loading: false, stale: false }]);
const dashboardProps = (view) => ({ loaded: true, hasExpenses: true, monthTotal: view.months.length ? view.months[0].total : 0,
  lastMonthTotal: 100, dailyTotals: view.months[0]?.dailyTotals ?? [], prevDailyTotals: [],
  monthKey: '2026-10', currentMonthKey: '2026-11', displayCurrency: 'TWD', categoryMonths: view.months,
  allCategories: getAllCategories(), categoryBudgets: {}, spendingSections: view.spendingSections,
  fxMode: true, coverage: view.months[0]?.coverage, previousCoverage: coverage(100) });
const insightProps = (view, patch = {}) => ({ loaded: true, hasExpenses: true, fxMode: true, displayCurrency: 'TWD',
  monthlyBudget: 1000, categoryBudgets: {}, regularCategories: getRegularAll(), externalCategories: getExternalAll(),
  months: view.months, monthKey: '2026-10', currentMonthKey: '2026-11', onReorderCategories: jest.fn(), ...patch });
beforeEach(() => { mockLanguage = 'en'; global.__DEV__ = false; jest.spyOn(Date, 'now').mockReturnValue(date); });
afterEach(() => { jest.restoreAllMocks(); delete global.__DEV__; });

it.each(['en', 'zh', 'es'])('renders estimated/loading row disclosure and full original/target accessibility in %s', (language) => {
  mockLanguage = language;
  const view = fixture([personal()], [], () => ({ status: 'loading' }));
  const row = view.spendingSections[0].data[0], onEdit = jest.fn();
  const ui = render(ExpenseRow, { expense: row, fxMode: true, displayCurrency: 'TWD', categories: getAllCategories(), onEdit });
  expect(text(ui.tree())).toContain(t('fx.estimated')); expect(text(ui.tree())).toContain(t('fx.updating'));
  const button = ui.nodes('Pressable')[0];
  expect(button.props.accessibilityRole).toBe('button');
  for (const value of ['USD', 'TWD', t('fx.original'), t('fx.estimated')]) expect(button.props.accessibilityLabel).toContain(value);
  button.props.onPress();
  expect(resolveSpendingEdit(onEdit.mock.calls[0][0], [personal()], [], []).record).toEqual(personal());
});

it('keeps historical/identity badges quiet and makes stale observations explicit', () => {
  const historicalValue = fixture().spendingSections[0].data[0];
  const ui = render(ExpenseRow, { expense: historicalValue, fxMode: true, displayCurrency: 'TWD', categories: getAllCategories(), onEdit: jest.fn() });
  expect(ui.nodes('Pressable')[0].props.accessibilityLabel).toContain(t('fx.historical'));
  expect(text(ui.tree())).not.toContain(t('fx.historical'));
  const stale = fixture([personal()], [], (row, target) => ({ ...historical(row, target), cache: { stale: true } })).spendingSections[0].data[0];
  ui.update({ expense: stale }); expect(text(ui.tree())).toContain(t('fx.cached'));
  const identity = fixture([personal()], [], historical, 'USD').spendingSections[0].data[0];
  ui.update({ expense: identity, displayCurrency: 'USD' });
  expect(text(ui.tree())).not.toContain(t('fx.historical')); expect(text(ui.tree())).not.toContain(t('fx.estimated'));
});

it('labels a shared row as your saved share and edits the full original bill', () => {
  const bill = { id: 'bill', groupId: 'g', amount: 100, currency: 'USD', category: 'food', createdAt: date, shares: { you: 25, friend: 75 } };
  const row = fixture([], [bill]).spendingSections[0].data[0], onEdit = jest.fn();
  const ui = render(ExpenseRow, { expense: row, fxMode: true, displayCurrency: 'TWD', categories: getAllCategories(), onEdit });
  expect(text(ui.tree())).toContain(t('fx.yourShare')); expect(text(ui.tree())).toContain('$25.00 USD');
  expect(text(ui.tree())).not.toContain('$100.00');
  ui.nodes('Pressable')[0].props.onPress();
  expect(resolveSpendingEdit(onEdit.mock.calls[0][0], [], [bill], [{ id: 'g' }]).record).toEqual(bill);
});

it('uses exact filtered coverage and current original values for delete confirmation', () => {
  const inputs = [personal(), personal({ id: 'invalid', category: 'transport', currency: 'ZZZ' })];
  const view = fixture(inputs), onDelete = jest.fn(), owner = {};
  const ui = render(ExpenseList, { fxMode: true, accountKey: owner, spendingSections: view.spendingSections,
    loaded: true, hasSpending: true, groups: [], categories: getAllCategories(), displayCurrency: 'TWD',
    monthKey: '2026-10', currentMonthKey: '2026-10', onDelete, onEditPress: jest.fn() });
  expect(text(ui.tree())).toContain(t('fx.incomplete'));
  const food = getAllCategories().find((category) => category.id === 'food');
  ui.nodes('Pressable').find((node) => text(node).trim() === getCategoryLabel(food, t)).props.onPress(); ui.update();
  expect(text(ui.tree())).not.toContain(t('fx.incomplete'));
  const expenseButton = ui.nodes('Pressable').find((node) => node.props.accessibilityLabel?.startsWith('foodtest'));
  expenseButton.props.onLongPress(); ui.update();
  expect(text(ui.nodes('Modal')[0])).toContain('$20.00 USD');
  const editedView = fixture([personal({ amount: 30 })]);
  ui.update({ spendingSections: editedView.spendingSections });
  expect(text(ui.nodes('Modal')[0])).toContain('$30.00 USD');
  const confirm = nodes(ui.nodes('Modal')[0]).find((node) => node.type === 'Pressable' && text(node).trim() === t('common.delete'));
  expect(confirm).toBeDefined(); confirm.props.onPress();
  expect(onDelete).toHaveBeenCalledWith('p'); expect(onDelete).toHaveBeenCalledTimes(1);
  ui.update();
  ui.nodes('Pressable').find((node) => node.props.accessibilityLabel?.startsWith('foodtest')).props.onLongPress(); ui.update();
  ui.update({ accountKey: {} });
  expect(ui.nodes('Modal')[0]?.props.visible).toBe(false);
  ui.update({ accountKey: owner, spendingSections: [] });
  expect(ui.nodes('Modal')[0]?.props.visible).toBe(false);
});

it('does not render a fake Dashboard total, percentage, or category ranking from incomplete data', () => {
  const view = fixture([personal(), personal({ id: 'invalid', currency: 'ZZZ', category: 'transport' })]);
  const props = dashboardProps(view); props.monthTotal = null;
  const ui = render(Dashboard, props);
  expect(text(ui.tree())).toContain(t('fx.unavailable')); expect(text(ui.tree())).not.toContain('%');
  expect(ui.nodes('Circle')).toHaveLength(0);
  expect(text(ui.tree())).toContain(t('fx.categoriesUnavailable'));
  const category = getAllCategories().find((item) => item.id === 'transport');
  expect(text(ui.tree())).toContain(getCategoryLabel(category, t));
});

it('keeps category detail navigation and never invents donut proportions', () => {
  const view = fixture([personal({ currency: 'ZZZ' })]), onMoreDetail = jest.fn();
  const ui = render(CategorySummary, { fxMode: true, months: view.months, monthKey: '2026-10', displayCurrency: 'TWD', allCategories: getAllCategories(), categoryBudgets: {}, onMoreDetail });
  expect(ui.nodes('Circle')).toHaveLength(0);
  ui.nodes('Pressable')[0].props.onPress(); expect(onMoreDetail).toHaveBeenCalledTimes(1);
});

it('preserves an unavailable month in the six-month Dashboard trend instead of zero-filling it', () => {
  const view = fixture([personal({ currency: 'ZZZ' })]);
  const ui = render(Dashboard, dashboardProps(view));
  ui.nodes('Pressable').find((node) => text(node).trim() === t('dash.chartMonthly')).props.onPress(); ui.update();
  expect(text(ui.tree())).toContain(t('fx.chartGaps'));
  // The six-month trend has five genuinely empty zero slots; October remains a gap.
  expect(ui.nodes('View').filter((node) => Array.isArray(node.props.style) && node.props.style.some((style) => style?.borderRadius === 999))).toHaveLength(0);
});

it('supports FX readiness without changing static-mode readiness or showing prior-account amounts', () => {
  const props = dashboardProps(fixture());
  const ui = render(Dashboard, { ...props, loaded: false, fxReady: false, monthTotal: 123456 });
  expect(text(ui.tree())).toContain(t('fx.loading')); expect(text(ui.tree())).not.toContain('123,456');
  ui.update({ fxMode: false, monthTotal: 650 });
  expect(text(ui.tree())).toContain('NT$650');
  expect(text(ui.tree())).not.toContain(t('fx.historical'));
});

it('shows a genuine zero for a complete empty period and includes mixed estimate disclosure', () => {
  const empty = render(Dashboard, { ...dashboardProps(fixture()), monthTotal: 0, lastMonthTotal: 0,
    coverage: summarizeReportingFx([]), previousCoverage: summarizeReportingFx([]), hasExpenses: false });
  expect(text(empty.tree())).toContain('NT$0'); expect(text(empty.tree())).not.toContain(t('fx.unavailable'));
  const mixed = summarizeReportingFx([{ status: 'historical', amount: 10, currency: 'TWD' }, { status: 'estimated', amount: 20, currency: 'TWD' }]);
  expect(text(render(ReportingFxStatus, { coverage: mixed, summary: true }).tree())).toContain(t('fx.includesEstimates'));
});

it.each(['en', 'zh', 'es'])('keeps incomplete Insight categories and budget state honest in %s', (language) => {
  mockLanguage = language;
  const view = fixture([personal(), personal({ id: 'invalid', currency: 'ZZZ', category: 'transport' })]);
  const ui = render(Insight, insightProps(view));
  expect(text(ui.tree())).toContain(t('fx.budgetUnavailable'));
  expect(text(ui.tree())).toContain('NT$1,000');
  expect(ui.nodes('Text').some((node) => text(node).trim() === t('budget.remaining'))).toBe(false);
  expect(text(ui.tree())).not.toContain('%');
  const transport = getAllCategories().find((category) => category.id === 'transport');
  expect(text(ui.tree())).toContain(getCategoryLabel(transport, t));
  expect(text(ui.tree())).toContain(t('fx.incomplete'));
});

it('excludes unavailable non-budgeted and external categories from the exact budgeted gauge subset', () => {
  const external = getExternalAll()[0];
  const view = fixture([personal(), personal({ id: 'invalid', currency: 'ZZZ', category: 'transport' }), personal({ id: 'external', currency: 'ZZZ', category: external.id })]);
  const ui = render(Insight, insightProps(view, { monthlyBudget: 0, categoryBudgets: { food: 1000 } }));
  expect(text(ui.tree())).not.toContain(t('fx.budgetUnavailable'));
  expect(text(ui.tree())).toContain(t('budget.remaining'));
  expect(text(ui.tree())).toContain(t('fx.unavailable'));
});

it('marks an incomplete budgeted-category subset unavailable and keeps its known allocation', () => {
  const view = fixture([personal(), personal({ id: 'invalid', currency: 'ZZZ', category: 'transport' })]);
  const ui = render(Insight, insightProps(view, { monthlyBudget: 0, categoryBudgets: { food: 400, transport: 200 } }));
  expect(text(ui.tree())).toContain(t('fx.budgetUnavailable'));
  expect(text(ui.tree())).toContain('NT$600');
  expect(text(ui.tree())).not.toContain('%');
  expect(ui.nodes('Pressable').find((node) => node.props.accessibilityLabel?.includes(getCategoryLabel(getAllCategories().find((category) => category.id === 'transport'), t))).props.accessibilityLabel).toContain('TWD');
});

it.each([null, undefined, NaN, Infinity])('never renders a fake zero for an unavailable expense amount %p', (amount) => {
  const row = fixture().spendingSections[0].data[0];
  const ui = render(ExpenseRow, { expense: { ...row, fx: { status: 'unavailable', amount } }, fxMode: true, displayCurrency: 'TWD', categories: getAllCategories() });
  expect(text(ui.tree())).toContain(t('fx.unavailable'));
  expect(text(ui.tree())).not.toContain('NT$0');
  expect(ui.nodes('Pressable')[0].props.accessibilityLabel).toContain('TWD');
  expect(ui.nodes('Pressable')[0].props.accessibilityLabel).toContain('USD');
});

it('preserves the overall 75 percent and category 85 percent rules in FX mode', () => {
  const colors = useTheme().colors;
  const ui = render(BudgetBar, { fxMode: true, spent: 75, budget: 100, displayCurrency: 'USD',
    coverage: { ...coverage(75), currency: 'USD' }, styles: {}, colors, t });
  expect(ui.nodes('Text').some((node) => Array.isArray(node.props.style) && node.props.style.some((style) => style?.color === 'orange'))).toBe(true);
});

function comparisonFixture(currentStatus = 'historical', previousStatus = 'estimated', loading = true) {
  const month = (key, amount, status, pending = false) => {
    const monthCoverage = summarizeReportingFx([{ currency: 'TWD', amount, status, loading: pending, stale: false }]);
    return { key, total: monthCoverage.amount, coverage: monthCoverage, byCategory: { food: monthCoverage.amount },
      categoryCoverage: { food: monthCoverage }, dailyTotals: [monthCoverage.amount] };
  };
  const current = month('2026-10', 50, currentStatus), previous = month('2026-09', 20, previousStatus, loading);
  return { props: { ...dashboardProps(fixture()), monthTotal: current.total, lastMonthTotal: previous.total,
    coverage: current.coverage, previousCoverage: previous.coverage,
    dailyTotals: current.dailyTotals, prevDailyTotals: previous.dailyTotals, categoryMonths: [current, previous] }, month };
}
function selectMonthly(ui) {
  ui.nodes('Pressable').find((node) => text(node).trim() === t('dash.chartMonthly')).props.onPress(); ui.update();
}
function spendingCard(ui) {
  const hero = ui.nodes('Text').find((node) => node.props.style?.fontSize === 48);
  const heroRow = ui.nodes('View').find((node) => [node.props.children].flat().includes(hero));
  return ui.nodes('View').find((node) => [node.props.children].flat().includes(heroRow));
}

it.each(['en', 'zh', 'es'])('discloses the exact 50 Historical vs 20 Estimated/loading comparison and trend in %s', (language) => {
  mockLanguage = language;
  const { props } = comparisonFixture(), ui = render(Dashboard, props); selectMonthly(ui);
  const card = spendingCard(ui), texts = nodes(card).filter((node) => node.type === 'Text');
  const contextual = texts.filter((node) => text(node).startsWith(t('fx.trendComparison') + ':'));
  expect(text(card)).toMatch(/150\.0\s*%/); expect(text(card)).toContain('↑');
  expect(contextual).toHaveLength(1);
  expect(text(contextual[0])).toContain(t('fx.includesEstimates'));
  expect(text(contextual[0])).toContain(t('fx.updating'));
  expect(text(contextual[0])).not.toContain('NT$'); // Disclosure does not add another total.
  expect(texts.filter((node) => node.props.style?.fontSize === 48)).toHaveLength(1);
  expect(texts.find((node) => node.props.style?.fontSize === 48).props.accessibilityLabel).toBe('NT$50 TWD');
  expect(texts.some((node) => text(node) === t('fx.historical'))).toBe(true); // October keeps its own historical disclosure.
});

it.each([
  ['estimated', 'historical', false, true],
  ['historical', 'historical', false, false],
  ['historical', 'estimated', false, true],
])('uses both comparison months without duplicate identical disclosures: %s / %s', (current, previous, loading, estimated) => {
  const { props } = comparisonFixture(current, previous, loading), ui = render(Dashboard, props);
  const card = spendingCard(ui), contextual = nodes(card).find((node) => node.type === 'Text' && text(node).startsWith(t('fx.comparison') + ':'));
  expect(text(card)).toMatch(/150\.0\s*%/);
  expect(Boolean(contextual && text(contextual).includes(t('fx.includesEstimates')))).toBe(estimated);
  expect(text(card)).not.toContain(t('fx.updating'));
  if (current === previous || current === 'estimated') {
    const key = estimated ? 'fx.includesEstimates' : 'fx.historical';
    expect(nodes(card).filter((node) => node.type === 'Text' && text(node).includes(t(key)))).toHaveLength(1);
  }
});

it('suppresses an unavailable comparison percentage while keeping an honest chart disclosure', () => {
  const { props } = comparisonFixture('estimated', 'unavailable', false), ui = render(Dashboard, props); selectMonthly(ui);
  const card = spendingCard(ui);
  expect(text(card)).not.toContain('%');
  const contextual = nodes(card).find((node) => node.type === 'Text' && text(node).startsWith(t('fx.trend') + ':'));
  expect(text(contextual)).toContain(t('fx.incomplete'));
  expect(text(contextual)).toContain(t('fx.includesEstimates'));
  expect(text(card)).toContain('NT$50');
});

it('discloses only estimates inside the displayed trend and recomputes when the chart mode changes', () => {
  const { props, month } = comparisonFixture('historical', 'historical', false);
  const inTrend = month('2026-05', 30, 'estimated', true), outside = month('2026-04', 40, 'estimated', true);
  const ui = render(Dashboard, { ...props, categoryMonths: [...props.categoryMonths, inTrend, outside] });
  expect(text(spendingCard(ui))).not.toContain(t('fx.includesEstimates'));
  selectMonthly(ui);
  expect(text(spendingCard(ui))).toContain(t('fx.includesEstimates'));
  expect(text(spendingCard(ui))).toContain(t('fx.updating'));
  ui.update({ categoryMonths: [...props.categoryMonths, outside] });
  expect(text(spendingCard(ui))).not.toContain(t('fx.includesEstimates'));
  expect(text(spendingCard(ui))).not.toContain(t('fx.updating'));
});

it('does not leak an outside-month estimate into comparison or trend disclosures', () => {
  const { props, month } = comparisonFixture('historical', 'historical', false);
  const ui = render(Dashboard, { ...props, categoryMonths: [...props.categoryMonths, month('2026-04', 40, 'estimated', true)] });
  selectMonthly(ui);
  expect(text(spendingCard(ui))).not.toContain(t('fx.includesEstimates'));
  expect(text(spendingCard(ui))).not.toContain(t('fx.updating'));
});

it('leaves legacy static comparisons and chart values unchanged without FX disclosures', () => {
  const { props } = comparisonFixture(), ui = render(Dashboard, { ...props, fxMode: false }); selectMonthly(ui);
  const card = spendingCard(ui);
  expect(text(card)).toContain('NT$50'); expect(text(card)).toMatch(/150\.0\s*%/);
  for (const key of ['fx.historical', 'fx.includesEstimates', 'fx.updating', 'fx.trendComparison']) expect(text(card)).not.toContain(t(key));
});
