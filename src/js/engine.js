// Timer engine — runs only inside the main window (which is hidden, never
// destroyed, when "closed"). Owns the sit/stand and water state machines,
// persistence, and all shell side-effects (dock icon, badge, bounce, tray,
// notifications, popover auto-open). Other surfaces sync via Tauri events.

import { invoke, emit, listen, isTauri } from './bridge.js';
import { isDark, onThemeChange } from './theme.js';
import { drawDockIcon } from './dockicon.js';

const LS_SETTINGS = 'standup.settings.v1';
const LS_TIMERS = 'standup.timers.v1';

// ?fast — debug mode: a "minute" lasts one second, so the whole
// sit → stand → water lifecycle can be exercised quickly
const MINUTE = new URLSearchParams(location.search).has('fast') ? 1000 : 60000;

export const EV_STATE = 'standup://state';
export const EV_ACTION = 'standup://action';
export const EV_REQUEST = 'standup://request-state';

const DEFAULT_SETTINGS = {
  sitMin: 45,
  standMin: 5,
  waterMin: 30,
  launchAtLogin: true,
  accent: '#1E90FF',
  ringWidth: 9,
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  sit: { phase: 'sitting', startedAt: Date.now() },     // sitting | alert | standing | standDone
  water: { phase: 'countdown', startedAt: Date.now() }, // countdown | alert
};

const viewListeners = [];
let lastDockSig = '';

// ---------- persistence ----------

function loadPersisted() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null');
    if (s) Object.assign(state.settings, s);
    // accent has no UI yet — it is a build-time constant, so persisted
    // values from older builds must not override it
    state.settings.accent = DEFAULT_SETTINGS.accent;
    const t = JSON.parse(localStorage.getItem(LS_TIMERS) || 'null');
    if (t && t.sit && t.water) {
      state.sit = t.sit;
      state.water = t.water;
      // if a deadline passed while the app was not running, land on alert once
      if (state.sit.phase === 'sitting' && remaining('sit') <= 0) state.sit.phase = 'alert';
      if (state.sit.phase === 'standing' && remaining('sit') <= 0) state.sit.phase = 'standDone';
      if (state.water.phase === 'countdown' && remaining('water') <= 0) state.water.phase = 'alert';
    }
  } catch (e) { console.warn('persist load', e); }
}

function persistTimers() {
  localStorage.setItem(LS_TIMERS, JSON.stringify({ sit: state.sit, water: state.water }));
}
function persistSettings() {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings));
}

// ---------- timing ----------

function totalMs(kind) {
  const s = state.settings;
  if (kind === 'sit') {
    return (state.sit.phase === 'standing' ? s.standMin : s.sitMin) * MINUTE;
  }
  return s.waterMin * MINUTE;
}

function remaining(kind) {
  const t = kind === 'sit' ? state.sit : state.water;
  return t.startedAt + totalMs(kind) - Date.now();
}

function minLeft(kind) {
  return Math.max(1, Math.ceil(remaining(kind) / MINUTE));
}

// ---------- view ----------

function computeView() {
  const s = state.settings;
  const sitPhase = state.sit.phase;
  const waterPhase = state.water.phase;

  let sitPct = 100;
  if (sitPhase === 'sitting' || sitPhase === 'standing') {
    sitPct = Math.max(0, Math.min(100, remaining('sit') / totalMs('sit') * 100));
  }
  let waterPct = 100;
  if (waterPhase === 'countdown') {
    waterPct = Math.max(0, Math.min(100, remaining('water') / totalMs('water') * 100));
  }

  const captions = {
    sitting: `Sitting · ${minLeft('sit')} min left`,
    alert: 'Time to stand up',
    standing: `Standing · ${minLeft('sit')} min left`,
    standDone: 'Done · next round',
  };

  return {
    dark: isDark(),
    accent: s.accent,
    ringWidth: s.ringWidth,
    sitPhase, waterPhase, sitPct, waterPct,
    sitCaption: captions[sitPhase],
    waterCaption: waterPhase === 'alert' ? 'Time to hydrate' : `Water · ${minLeft('water')} min left`,
    settings: { ...s },
  };
}

function broadcast() {
  const view = computeView();
  for (const cb of viewListeners) cb(view);
  emit(EV_STATE, view);
  updateDockIcon(view);
}

function updateDockIcon(view) {
  if (!isTauri) return;
  const sig = [
    view.dark, view.accent, view.sitPhase, view.waterPhase,
    Math.round(view.sitPct), Math.round(view.waterPct),
  ].join('|');
  if (sig === lastDockSig) return;
  lastDockSig = sig;
  invoke('set_dock_icon', { png: drawDockIcon(view) });
}

// ---------- alerts / shell side-effects ----------

function anyAlert() {
  return state.sit.phase === 'alert' || state.water.phase === 'alert';
}

function fireAlert(kind) {
  const [title, body] = kind === 'sit'
    ? ['Time to stand up', 'Your sitting interval is over — stretch your legs for a bit.']
    : ['Time to hydrate', 'Grab a glass of water before you keep going.'];
  invoke('notify', { title, body });
  invoke('set_tray_alert', { alert: true, dark: isDark() });
  invoke('set_dock_badge', { label: '!' });
  invoke('request_attention', {});
  invoke('show_popover', {});
}

function settleAlerts() {
  if (!anyAlert()) {
    invoke('set_tray_alert', { alert: false, dark: isDark() });
    invoke('set_dock_badge', { label: null });
  }
}

// ---------- state machine ----------

function tick() {
  let changed = false;

  if (state.sit.phase === 'sitting' && remaining('sit') <= 0) {
    state.sit.phase = 'alert';
    fireAlert('sit');
    changed = true;
  } else if (state.sit.phase === 'standing' && remaining('sit') <= 0) {
    state.sit.phase = 'standDone';
    changed = true;
  }

  if (state.water.phase === 'countdown' && remaining('water') <= 0) {
    state.water.phase = 'alert';
    fireAlert('water');
    changed = true;
  }

  if (changed) persistTimers();
  broadcast();
}

export function dispatch(action, value) {
  const now = Date.now();
  switch (action) {
    case 'sit-scrub': { // drag the ring handle → set remaining time directly
      if (state.sit.phase !== 'sitting' && state.sit.phase !== 'standing') return;
      const pct = Math.min(100, Math.max(0, Number(value)));
      if (!Number.isFinite(pct)) return;
      state.sit.startedAt = now - (1 - pct / 100) * totalMs('sit');
      break;
    }
    case 'water-scrub': {
      if (state.water.phase !== 'countdown') return;
      const pct = Math.min(100, Math.max(0, Number(value)));
      if (!Number.isFinite(pct)) return;
      state.water.startedAt = now - (1 - pct / 100) * totalMs('water');
      break;
    }
    case 'sit-start': // alert → standing
      if (state.sit.phase !== 'alert') return;
      state.sit = { phase: 'standing', startedAt: now };
      break;
    case 'sit-skip': // alert → sitting (skip the stand)
      if (state.sit.phase !== 'alert') return;
      state.sit = { phase: 'sitting', startedAt: now };
      break;
    case 'sit-next': // standDone → sitting
      if (state.sit.phase !== 'standDone') return;
      state.sit = { phase: 'sitting', startedAt: now };
      break;
    case 'water-done':
    case 'water-skip': // alert → countdown (refill)
      if (state.water.phase !== 'alert') return;
      state.water = { phase: 'countdown', startedAt: now };
      break;
    default:
      return;
  }
  persistTimers();
  settleAlerts();
  broadcast();
}

// ---------- settings ----------

export function setSetting(key, value) {
  state.settings[key] = value;
  persistSettings();
  if (key === 'launchAtLogin') invoke('set_autostart', { enabled: value });
  broadcast();
}

export function getSettings() {
  return { ...state.settings };
}

// ---------- lifecycle ----------

export function onView(cb) {
  viewListeners.push(cb);
}

export function start() {
  loadPersisted();

  // reflect the real launch-at-login state from the OS
  invoke('get_autostart', {}).then((enabled) => {
    if (typeof enabled === 'boolean' && enabled !== state.settings.launchAtLogin) {
      state.settings.launchAtLogin = enabled;
      persistSettings();
      broadcast();
    }
  });
  // apply the desired default on first run
  if (localStorage.getItem('standup.autostart.applied') !== '1') {
    invoke('set_autostart', { enabled: state.settings.launchAtLogin });
    localStorage.setItem('standup.autostart.applied', '1');
  }

  listen(EV_ACTION, (e) => dispatch(e.payload?.type, e.payload?.value));
  listen(EV_REQUEST, () => broadcast());
  onThemeChange(() => broadcast());

  if (anyAlert()) {
    invoke('set_tray_alert', { alert: true, dark: isDark() });
    invoke('set_dock_badge', { label: '!' });
  }

  tick();
  setInterval(tick, 1000);
}
