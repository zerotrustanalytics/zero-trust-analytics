/**
 * Chart colors for Recharts, from the ZTA × Tally tokens in styles/zta.css.
 * Values are CSS variables, so charts follow light/dark mode automatically.
 * Primary series = plum line (--c-cur) over a sun area (--c-area); a previous
 * period is the dashed --c-prev line. Text on charts uses --ink-3.
 */
export const chart = {
  primary: 'var(--c-cur)',
  secondary: 'var(--tomato)',
  area: 'var(--c-area)',
  prev: 'var(--c-prev)',
  grid: 'var(--c-grid)',
  axis: 'var(--ink-3)',
  danger: 'var(--bad)',
  tooltip: {
    backgroundColor: 'var(--code-bg)',
    border: 'none',
    borderRadius: '12px',
    color: 'var(--code-fg)',
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
  // Multi-series (e.g. one line per site): distinct in hue AND lightness.
  series: [
    'var(--c-cur)',
    'var(--tomato)',
    'var(--sky-text)',
    'var(--mint-text)',
    '#B07D06',
    'var(--blush)',
    '#7F6BB8',
    'var(--ink-3)',
  ],
} as const
