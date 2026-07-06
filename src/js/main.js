// Main window bootstrap: mounts the rings, wires the Reminders settings,
// and starts the timer engine.

import { mountRings } from './rings.js';
import * as engine from './engine.js';
import { isTauri, currentWindow, invoke } from './bridge.js';

// browser mode: wrap the window in the design-mock desktop frame
if (!isTauri) document.documentElement.classList.add('preview');

// traffic lights (the window is undecorated; these are the design's own dots)
const win = currentWindow();
document.querySelector('.tl.close').addEventListener('click', () => win?.hide());
document.querySelector('.tl.min').addEventListener('click', () => win?.minimize());

// standard shortcuts, handled here as well as in the app menu — when the
// webview is focused it sees the key event first
document.addEventListener('keydown', (e) => {
  if (!e.metaKey || e.repeat || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'w') { e.preventDefault(); win?.hide(); }
  else if (k === 'm') { e.preventDefault(); win?.minimize(); }
  else if (k === 'q') { e.preventDefault(); invoke('quit_app', {}); }
});

const updateRings = mountRings(document.getElementById('rings'), engine.dispatch);

// ---- settings rows ----

const steppers = document.querySelectorAll('.stepper');
const loginToggle = document.getElementById('loginToggle');

for (const st of steppers) {
  const { key, step, min, max } = st.dataset;
  st.querySelector('.dec').addEventListener('click', () => bump(key, -Number(step), Number(min), Number(max)));
  st.querySelector('.inc').addEventListener('click', () => bump(key, Number(step), Number(min), Number(max)));
}

function bump(key, delta, min, max) {
  const cur = engine.getSettings()[key];
  const next = Math.max(min, Math.min(max, cur + delta));
  if (next !== cur) engine.setSetting(key, next);
}

// click the value to type a duration directly
for (const st of steppers) {
  st.querySelector('.val').addEventListener('click', () => beginEdit(st));
}

function beginEdit(st) {
  if (st.querySelector('input')) return;
  const { key, min, max } = st.dataset;
  const val = st.querySelector('.val');

  const input = document.createElement('input');
  input.className = 'val-input';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.value = engine.getSettings()[key];
  val.style.display = 'none';
  val.after(input);
  input.focus();
  input.select();

  let done = false;
  const close = (commit) => {
    if (done) return;
    done = true;
    if (commit) {
      const n = Math.round(Number(input.value));
      if (input.value.trim() !== '' && Number.isFinite(n)) {
        engine.setSetting(key, Math.max(Number(min), Math.min(Number(max), n)));
      }
    }
    input.remove();
    val.style.display = '';
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') close(true);
    else if (e.key === 'Escape') close(false);
  });
  input.addEventListener('blur', () => close(true));
}

loginToggle.addEventListener('click', () => {
  engine.setSetting('launchAtLogin', !engine.getSettings().launchAtLogin);
});

function updateSettingsUI(settings) {
  for (const st of steppers) {
    const val = st.querySelector('.val');
    const text = `${settings[st.dataset.key]} min`;
    if (val.textContent !== text && val.textContent !== '') {
      val.classList.remove('pulse');
      void val.offsetWidth;
      val.classList.add('pulse');
    }
    val.textContent = text;
  }
  loginToggle.setAttribute('aria-checked', String(!!settings.launchAtLogin));
}

// ---- render loop ----

// Optional state overrides for design screenshots, e.g. ?sit=alert&water=alert&sitPct=52
const qp = new URLSearchParams(location.search);
function applyOverrides(view) {
  if (qp.has('sit')) view.sitPhase = qp.get('sit');
  if (qp.has('water')) view.waterPhase = qp.get('water');
  if (qp.has('sitPct')) view.sitPct = Number(qp.get('sitPct'));
  if (qp.has('waterPct')) view.waterPct = Number(qp.get('waterPct'));
  if (qp.has('sit')) {
    view.sitCaption = { sitting: 'Sitting · 23 min left', alert: 'Time to stand up', standing: 'Standing · 3 min left', standDone: 'Done · next round' }[view.sitPhase];
  }
  if (qp.has('water')) {
    view.waterCaption = view.waterPhase === 'alert' ? 'Time to hydrate' : 'Water · 18 min left';
  }
  return view;
}

engine.onView((view) => {
  updateRings(applyOverrides(view));
  updateSettingsUI(view.settings);
});

engine.start();
