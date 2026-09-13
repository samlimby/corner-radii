// The preview has no layout border: padding is the entire inset between edges.
export const RADIUS_STOPS = Object.freeze([4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);
export const DEFAULT_VALUES = Object.freeze({ outer: 40, inner: 20, padding: 20, size: 300 });
export const LIMITS = Object.freeze({ outer: [0, 48], inner: [0, 48], padding: [0, 100], size: [160, 360] });

export function innerRadius(outer, padding) {
  return Math.max(0, outer - padding);
}

export function nextValues(current, name, value) {
  if (!Object.hasOwn(LIMITS, name) || !Number.isFinite(value)) return current;
  const [min, max] = LIMITS[name];
  const next = Math.min(max, Math.max(min, Math.round(value / 4) * 4));
  if (name === 'inner') {
    const inner = Math.min(current.outer, next);
    // A zero radius does not uniquely determine padding. Keep the existing
    // padding when the user selects the already-clamped zero again.
    if (inner === current.inner) return current;
    return { ...current, inner, padding: current.outer - inner };
  }
  const result = { ...current, [name]: next };
  return { ...result, inner: innerRadius(result.outer, result.padding) };
}

export function needsExpandedPreview({ size, padding }, redlines) {
  return size + padding * 2 + (redlines ? 128 : 48) > 480;
}

// Scale all geometry equally, leaving the text at its normal readable size.
// Insets include the dimension lines, end ticks and three-digit labels.
export function previewScale({ size, padding }, width, height, redlines, expanded) {
  const gutter = expanded || width < 480 ? 24 : 0;
  const horizontal = redlines ? 136 : 32;
  const vertical = redlines ? 72 : 32;
  const footprint = size + padding * 2;
  return Math.max(0, Math.min(1,
    (width - horizontal - gutter * 2) / footprint,
    (height - vertical - gutter * 2) / footprint,
  ));
}
