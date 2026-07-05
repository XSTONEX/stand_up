// Color helpers & design tokens (ported from the handoff renderVals()).

export const ACCENTS = ['#1E90FF', '#63EBE9', '#8B7BFF', '#5BE39B'];
export const RED = '#FF6157';
export const WARM = '#F2B25C';
export const BADGE_RED = '#FF453A';

// mix(hex, pct, to): linear-interpolate hex color `pct` of the way toward `to`.
export function mix(hex, pct, to) {
  const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const a = h(hex), b = h(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * pct).toString(16).padStart(2, '0')).join('');
}

export function isDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function onThemeChange(cb) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => cb(isDark()));
}

export function tokens(dark) {
  return {
    textPri: dark ? '#F4F7F9' : '#1C242C',
    textSec: dark ? 'rgba(235,242,246,0.55)' : 'rgba(28,36,44,0.55)',
    iconBase: dark ? 'rgba(235,242,246,0.82)' : 'rgba(28,36,44,0.72)',
    glassHi: dark ? '#FFFFFF' : '#5B6B78',
  };
}
