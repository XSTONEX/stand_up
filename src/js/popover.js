// Menu-bar popover: a dumb renderer. State arrives via Tauri events from the
// engine in the main window; button presses are sent back as action events.

import { mountRings } from './rings.js';
import { emit, listen, invoke, isTauri } from './bridge.js';
import { EV_STATE, EV_ACTION, EV_REQUEST } from './engine.js';
import { isDark } from './theme.js';

if (!isTauri) document.documentElement.classList.add('preview');

const updateRings = mountRings(document.getElementById('rings'), (type, value) => {
  emit(EV_ACTION, { type, value });
});

listen(EV_STATE, (e) => updateRings(e.payload));
emit(EV_REQUEST, {});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') invoke('hide_popover', {});
  else if (e.metaKey && e.key.toLowerCase() === 'w') { e.preventDefault(); invoke('hide_popover', {}); }
  else if (e.metaKey && e.key.toLowerCase() === 'q') { e.preventDefault(); invoke('quit_app', {}); }
});

// browser preview fallback: render a static example state
if (!isTauri) {
  const qp = new URLSearchParams(location.search);
  updateRings({
    dark: isDark(),
    accent: '#1E90FF',
    ringWidth: 9,
    sitPhase: qp.get('sit') ?? 'alert',
    waterPhase: qp.get('water') ?? 'countdown',
    sitPct: Number(qp.get('sitPct') ?? 55),
    waterPct: Number(qp.get('waterPct') ?? 62),
    sitCaption: (qp.get('sit') ?? 'alert') === 'alert' ? 'Time to stand up' : 'Sitting · 23 min left',
    waterCaption: qp.get('water') === 'alert' ? 'Time to hydrate' : 'Water · 18 min left',
  });
}
