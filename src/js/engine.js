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

// A gap this long between ticks (or between app runs) means the machine slept
// or the user left the desk — restart the countdowns instead of replaying the
// stale alerts they missed. Always real time, even in ?fast mode.
const GAP_MS = 5 * 60000;

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
    if (t && t.sit && t.water && Number.isFinite(t.sit.startedAt) && Number.isFinite(t.water.startedAt)) {
      state.sit = t.sit;
      state.water = t.water;
      // closed briefly → keep the timers; deadlines that passed meanwhile fire
      // through the first tick like any other. Closed for long → fresh start.
      if (!(Number.isFinite(t.seenAt) && Date.now() - t.seenAt <= GAP_MS)) resetTimers();
    }
  } catch (e) { console.warn('persist load', e); }
}

function persistTimers() {
  // seenAt is the liveness heartbeat loadPersisted() measures the away-gap against
  localStorage.setItem(LS_TIMERS, JSON.stringify({ sit: state.sit, water: state.water, seenAt: Date.now() }));
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

function resetTimers() {
  state.sit = { phase: 'sitting', startedAt: Date.now() };
  state.water = { phase: 'countdown', startedAt: Date.now() };
}

let lastTickAt = Date.now();

function tick() {
  const now = Date.now();
  const gap = now - lastTickAt;
  lastTickAt = now;

  if (gap > GAP_MS) {
    // the machine slept or the process was frozen — the user was away
    resetTimers();
    settleAlerts();
  } else {
    if (state.sit.phase === 'sitting' && remaining('sit') <= 0) {
      state.sit.phase = 'alert';
      fireAlert('sit');
    } else if (state.sit.phase === 'standing' && remaining('sit') <= 0) {
      state.sit.phase = 'standDone';
      // standDone also waits for a button press (Next) — tell the user, but
      // without the red tray/badge urgency of the real alerts
      invoke('notify', { title: 'Standing done', body: 'Nice work — press Next to start the next sitting round.' });
      invoke('show_popover', {});
    }

    if (state.water.phase === 'countdown' && remaining('water') <= 0) {
      state.water.phase = 'alert';
      fireAlert('water');
    }
  }

  persistTimers(); // every tick, so seenAt stays a fresh liveness heartbeat
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
  keepMinuteAfterShrink(key);
  broadcast();
}

// Lowering a duration below the time already elapsed must not fire the alert
// mid-adjustment — pin the running countdown to at least a minute instead.
function keepMinuteAfterShrink(key) {
  const kind =
    (key === 'sitMin' && state.sit.phase === 'sitting') ? 'sit' :
    (key === 'standMin' && state.sit.phase === 'standing') ? 'sit' :
    (key === 'waterMin' && state.water.phase === 'countdown') ? 'water' : null;
  if (!kind || remaining(kind) >= MINUTE) return;
  const t = kind === 'sit' ? state.sit : state.water;
  t.startedAt = Date.now() - (totalMs(kind) - MINUTE);
  persistTimers();
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
