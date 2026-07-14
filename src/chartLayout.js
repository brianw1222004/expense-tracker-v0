const MIN_Y_AXIS_LABEL_PADDING = 40;
const Y_AXIS_LABEL_GAP = 6;
const Y_AXIS_LABEL_INSET = 2;
const Y_AXIS_LABEL_CHAR_WIDTH = 5.6;

export function estimateAxisLabelWidth(label) {
  return String(label ?? '').length * Y_AXIS_LABEL_CHAR_WIDTH;
}

export function yAxisLabelPadding(labels) {
  const maxLabelWidth = labels.reduce(
    (max, label) => Math.max(max, estimateAxisLabelWidth(label)),
    0
  );

  return Math.ceil(Math.max(
    MIN_Y_AXIS_LABEL_PADDING,
    maxLabelWidth + Y_AXIS_LABEL_GAP + Y_AXIS_LABEL_INSET
  ));
}
