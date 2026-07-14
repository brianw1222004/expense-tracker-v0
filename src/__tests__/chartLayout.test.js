const {
  estimateAxisLabelWidth,
  yAxisLabelPadding,
} = require('../chartLayout');

describe('chart y-axis label layout', () => {
  it('keeps short USD labels on the compact default gutter', () => {
    expect(yAxisLabelPadding(['$50', '$100'])).toBe(40);
  });

  it('widens the gutter for longer TWD labels so they fit inside the SVG', () => {
    const labels = ['NT$1.0k', 'NT$3.0k', 'NT$10k'];
    const padding = yAxisLabelPadding(labels);
    const longest = Math.max(...labels.map(estimateAxisLabelWidth));

    expect(padding).toBeGreaterThan(40);
    expect(padding - 6).toBeGreaterThanOrEqual(longest + 2);
  });
});

