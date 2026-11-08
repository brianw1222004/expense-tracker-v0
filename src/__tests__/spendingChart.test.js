let mockHooks, mockIndex;
jest.mock('react', () => ({
  useMemo: (fn) => fn(),
  useState(initial) {
    const index = mockIndex++;
    if (!Object.prototype.hasOwnProperty.call(mockHooks, index)) mockHooks[index] = initial;
    return [mockHooks[index], (value) => { mockHooks[index] = typeof value === 'function' ? value(mockHooks[index]) : value; }];
  },
}));
jest.mock('react/jsx-runtime', () => ({ jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (styles) => styles } }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path', Circle: 'Circle', Line: 'Line', Text: 'SvgText' }));
jest.mock('../theme', () => ({ useTheme: () => ({ colors: { accent: 'accent', textMuted: 'muted' } }),
  fonts: {}, spacing: { xs: 4, sm: 8 } }));
const Chart = require('../components/SpendingChart').default;
const { spendingChartPath } = require('../components/SpendingChart');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
const styleOf = (node) => Object.assign({}, ...[node.props?.style].flat().filter(Boolean));
function render(patch = {}) {
  mockHooks = []; let tree;
  const props = { dailyTotals: [10, 20, 30, 40], displayCurrency: 'USD', endDay: 4, ...patch };
  const update = (next = {}) => { Object.assign(props, next); mockIndex = 0; tree = Chart(props); };
  update();
  const wrap = () => nodes(tree).find((node) => node.props?.onLayout);
  wrap().props.onLayout({ nativeEvent: { layout: { width: 393 } } }); update();
  return { update, tree: () => tree, nodes: (type) => nodes(tree).filter((node) => node.type === type),
    scrub(index, count = props.mode === 'monthly' ? props.monthlyTotals.length : props.dailyTotals.length) {
      wrap().props.onResponderGrant({ nativeEvent: { locationX: 40 + index / (count - 1) * 341 } }); update();
    }, release() { wrap().props.onResponderRelease(); update(); } };
}
function expectFiniteGeometry(ui) {
  for (const node of nodes(ui.tree())) {
    for (const key of ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r']) {
      if (node.props?.[key] !== undefined) expect(Number.isFinite(node.props[key])).toBe(true);
    }
    if (node.type === 'Path') expect(node.props.d).not.toMatch(/NaN|Infinity|null|undefined/);
  }
}

it('breaks a path at missing slots without joining unrelated observations', () => {
  expect(spendingChartPath([{ x: 1, y: 1 }, { x: 2, y: 2 }, null, { x: 4, y: 4 }])).toBe('M1,1 L2,2 M4,4');
  expect(spendingChartPath([null, null])).toBe('');
});

it.each(['daily', 'monthly'])('retains the missing %s slot and its x-axis position', (mode) => {
  const values = [10, 20, null, 40];
  const ui = render({ mode, dailyTotals: values, monthlyTotals: values.map((value, index) => ({ label: 'M' + index, value })) });
  const path = ui.nodes('Path')[0].props.d;
  expect(path.match(/M/g)).toHaveLength(2); expect(path.match(/L/g)).toHaveLength(1);
  expect(path).toMatch(/M381,/);
  expect(text(ui.tree())).toContain('fx.chartGaps');
  expectFiniteGeometry(ui);
  ui.scrub(2);
  expect(text(ui.tree())).toContain('fx.unavailable');
  expect(ui.nodes('View').filter((node) => styleOf(node).borderRadius === 999)).toHaveLength(0);
  ui.release();
  expect(text(ui.tree())).not.toContain('fx.unavailable');
});

it.each([null, undefined, NaN, Infinity, -Infinity])('does not replace an invalid latest value %p with an earlier value', (latest) => {
  const ui = render({ dailyTotals: [10, 20, latest], endDay: 3 });
  expect(ui.nodes('Circle')).toHaveLength(0);
  expect(ui.nodes('View').filter((node) => styleOf(node).borderRadius === 999)).toHaveLength(0);
  ui.scrub(2); expect(text(ui.tree())).toContain('fx.unavailable'); expectFiniteGeometry(ui);
});

it.each(['daily', 'monthly'])('handles an all-unavailable %s chart without fake zero values or invalid SVG', (mode) => {
  const values = [null, NaN, Infinity];
  const ui = render({ mode, dailyTotals: values, monthlyTotals: values.map((value, index) => ({ label: 'M' + index, value })), endDay: 3 });
  expect(ui.nodes('Path')).toHaveLength(0); expect(ui.nodes('Circle')).toHaveLength(0);
  expect(text(ui.tree())).toContain('fx.chartUnavailable'); expect(text(ui.tree())).not.toContain('$0');
  ui.scrub(1); expect(text(ui.tree())).toContain('fx.unavailable'); expectFiniteGeometry(ui);
});

it('keeps comparison gaps independent and excludes invalid values from the shared scale', () => {
  const ui = render({ dailyTotals: [10, null, 30], endDay: 3, compareTotals: [Infinity, 60, NaN] });
  expect(ui.nodes('Path')).toHaveLength(2);
  expect(ui.nodes('Path').every((node) => !node.props.d.includes('L'))).toBe(true);
  ui.scrub(1); expect(text(ui.tree())).toContain('fx.unavailable'); expect(text(ui.tree())).toContain('$60');
  expectFiniteGeometry(ui);
});

it('preserves complete positive legacy geometry and valid zero tooltips', () => {
  const ui = render({ dailyTotals: [0, 10], endDay: 2 });
  expect(ui.nodes('Path')[0].props.d).toBe('M40,122 L381,20');
  expect(text(ui.tree())).not.toContain('fx.chartGaps');
  ui.scrub(0); expect(text(ui.tree())).toContain('$0'); expect(text(ui.tree())).not.toContain('fx.unavailable');
});

it('keeps geometry finite for valid negative and extreme finite values', () => {
  for (const values of [[-10, 0, 10], [-Number.MAX_VALUE, 0, Number.MAX_VALUE]]) {
    const ui = render({ dailyTotals: values, endDay: 3 }); expectFiniteGeometry(ui);
  }
});

it.each([
  [[10, null, 20, null], [0, 2]],
  [[null, 10, null], [1]],
  [[10, 20, null, 30], [3]],
  [[null, null, null], []],
  [[0, null, 20], [0, 2]],
])('renders isolated primary observations at their original slots: %p', (values, markerIndexes) => {
  const ui = render({ dailyTotals: values, endDay: values.length });
  const markers = ui.nodes('Circle').filter((node) => node.key?.startsWith('dot-'));
  expect(markers.map((node) => node.props.cx)).toEqual(markerIndexes.map((index) => 40 + index / (values.length - 1) * 341));
  const paths = ui.nodes('Path').map((node) => node.props.d);
  expect(paths.join(' ').match(/L/g)?.length ?? 0).toBe(values[1] === 20 ? 1 : 0);
  expectFiniteGeometry(ui);
  if (values[0] === 0) {
    expect(markers[0].props.cy).toBe(122); ui.scrub(0);
    expect(text(ui.tree())).toContain('$0'); expect(text(ui.tree())).not.toContain('fx.unavailable');
  }
  if (values.at(-1) === null) expect(ui.nodes('View').filter((node) => styleOf(node).borderRadius === 999)).toHaveLength(0);
});

it('renders isolated comparison observations, without gap-spanning paths or duplicate active markers', () => {
  const ui = render({ dailyTotals: [1, 2, 3, 4], compareTotals: [10, null, 20, null] });
  const comparisonDots = () => ui.nodes('Circle').filter((node) => node.key?.startsWith('compare-dot-'));
  expect(comparisonDots().map((node) => node.props.cx)).toEqual([40, 40 + 2 / 3 * 341]);
  expect(comparisonDots().every((node) => node.props.opacity === 0.28)).toBe(true);
  expect(ui.nodes('Path')[0].props.d).not.toContain('L');
  ui.scrub(0);
  expect(ui.nodes('Circle').filter((node) => node.props.cx === 40 && node.props.opacity === 0.6)).toHaveLength(1);
  expect(text(ui.tree())).toContain('$10');
  ui.release(); expect(comparisonDots()).toHaveLength(2); expectFiniteGeometry(ui);
});

it('never creates primary or comparison markers for non-finite observations', () => {
  const ui = render({ dailyTotals: [null, NaN, Infinity], compareTotals: [Infinity, null, NaN], endDay: 3 });
  expect(ui.nodes('Circle')).toHaveLength(0); expectFiniteGeometry(ui);
});

it('keeps a complete legacy daily series uncluttered with its existing latest and scrub markers', () => {
  const ui = render({ dailyTotals: [10, 20, 30, 40], compareTotals: [5, 15, 25, 35] });
  expect(ui.nodes('Circle')).toHaveLength(1); expect(ui.nodes('Circle')[0].props).toMatchObject({ cx: 381, r: 4 });
  expect(ui.nodes('Path').map((node) => node.props.d.match(/L/g).length)).toEqual([3, 3]);
  ui.scrub(1); expect(ui.nodes('Circle').filter((node) => node.props.r === 4.5)).toHaveLength(1);
  expect(text(ui.tree())).toContain('$20'); expect(text(ui.tree())).toContain('$15');
  ui.release(); expect(ui.nodes('Circle')).toHaveLength(1); expectFiniteGeometry(ui);
});
