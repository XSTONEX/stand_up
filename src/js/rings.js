// The shared ring pair (sit/stand + water) — the core visual, ported from
// StandUpWindow.dc.html. mountRings() builds the DOM once; the returned
// update(view) applies a view-state snapshot.

import { mix, tokens, RED, WARM } from './theme.js';
import { waterGeom } from './water.js';

const R = 57;
const C = 2 * Math.PI * R;

const TEMPLATE = `
<section class="module sit">
  <div class="ringbox">
    <svg class="ring" width="130" height="130" viewBox="0 0 130 130">
      <circle class="track" cx="65" cy="65" r="57" fill="none"></circle>
      <circle class="arc" cx="65" cy="65" r="57" fill="none" stroke-linecap="round"
              stroke-dasharray="${C.toFixed(1)}" transform="rotate(-90 65 65)"></circle>
    </svg>
    <div class="center">
      <img class="fig sit-fig" src="assets/icon-sit.png" alt="person sitting at a desk">
      <img class="fig stand-fig" src="assets/icon-stand.png" alt="person standing at a desk">
      <div class="disc two sit-disc2">
        <button class="primary" data-act="sit-start">Start</button><i></i>
        <button class="secondary" data-act="sit-skip">Skip</button>
      </div>
      <div class="disc one sit-disc1">
        <button class="primary" data-act="sit-next">Next</button>
      </div>
    </div>
    <div class="ring-knob sit-knob" role="slider" aria-label="adjust sitting time"></div>
  </div>
  <div class="caption sit-caption"></div>
</section>
<section class="module water">
  <div class="ringbox">
    <svg class="ring" width="130" height="130" viewBox="0 0 130 130">
      <defs>
        <linearGradient id="wrG" x1="0" y1="0" x2="1" y2="1">
          <stop class="wr-a" offset="0"></stop>
          <stop class="wr-b" offset="1"></stop>
        </linearGradient>
      </defs>
      <circle class="track" cx="65" cy="65" r="57" fill="none"></circle>
      <circle class="arc" cx="65" cy="65" r="57" fill="none" stroke="url(#wrG)" stroke-linecap="round"
              stroke-dasharray="${C.toFixed(1)}" transform="rotate(-90 65 65)"></circle>
    </svg>
    <div class="center">
      <div class="cupwrap">
        <svg class="cup" width="54" height="54" viewBox="0 0 48 48" fill="none">
          <defs>
            <clipPath id="ccG">
              <path d="M14.6 12 L16.9 37.3 Q17.2 40.6 20.9 40.6 L27.1 40.6 Q30.8 40.6 31.1 37.3 L33.4 12 Z"></path>
            </clipPath>
            <linearGradient id="wgG" x1="0" y1="15" x2="0" y2="41" gradientUnits="userSpaceOnUse">
              <stop class="wg-top" offset="0"></stop>
              <stop class="wg-bot" offset="1"></stop>
            </linearGradient>
          </defs>
          <g clip-path="url(#ccG)">
            <path class="water-body" fill="url(#wgG)" fill-opacity="0.92"></path>
            <path class="wave2" stroke="#FFFFFF" stroke-width="1.2" fill="none" stroke-linecap="round"></path>
          </g>
          <path class="surface" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
          <path class="cup-body" d="M13 11 L15.4 37.5 Q15.8 42 20.8 42 L27.2 42 Q32.2 42 32.6 37.5 L35 11"
                stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
          <path class="cup-rim" d="M11.6 11 L36.4 11" stroke-width="2.4" stroke-linecap="round"></path>
          <path class="cup-hi" d="M17.8 15 L18.9 29.5" stroke-width="1.5" stroke-linecap="round" opacity="0.45"></path>
        </svg>
      </div>
      <div class="disc two water-disc2">
        <button class="primary" data-act="water-done">Done</button><i></i>
        <button class="secondary" data-act="water-skip">Skip</button>
      </div>
    </div>
    <div class="ring-knob water-knob" role="slider" aria-label="adjust water time"></div>
  </div>
  <div class="caption water-caption"></div>
</section>
`;

export function mountRings(root, onAction) {
  root.innerHTML = TEMPLATE;

  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => onAction(btn.dataset.act));
  });

  const q = (sel) => root.querySelector(sel);
  const els = {
    root,
    sitTrack: q('.sit .track'), sitArc: q('.sit .arc'),
    sitFig: q('.sit-fig'), standFig: q('.stand-fig'),
    sitDisc2: q('.sit-disc2'), sitDisc1: q('.sit-disc1'),
    sitCaption: q('.sit-caption'),
    waterTrack: q('.water .track'), waterArc: q('.water .arc'),
    wrA: q('.wr-a'), wrB: q('.wr-b'),
    cupwrap: q('.cupwrap'),
    waterDisc2: q('.water-disc2'),
    waterCaption: q('.water-caption'),
    waterBody: q('.water-body'), wave2: q('.wave2'), surface: q('.surface'),
    cupBody: q('.cup-body'), cupRim: q('.cup-rim'), cupHi: q('.cup-hi'),
    wgTop: q('.wg-top'), wgBot: q('.wg-bot'), wgGrad: q('#wgG'),
    discs: root.querySelectorAll('.disc'),
    primaries: root.querySelectorAll('.disc button.primary'),
    sitKnob: q('.sit-knob'), waterKnob: q('.water-knob'),
    sitBox: q('.sit .ringbox'), waterBox: q('.water .ringbox'),
  };

  // ---- draggable handles: scrub the remaining time on the ring ----
  // pct is measured like the arc: 0 at 12 o'clock, growing clockwise
  function attachScrub(knob, box, type) {
    let lastPct = null;
    knob.addEventListener('pointerdown', (e) => {
      lastPct = null;
      box.classList.add('scrubbing');
      knob.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    knob.addEventListener('pointermove', (e) => {
      if (!box.classList.contains('scrubbing')) return;
      const r = box.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const deg = Math.atan2(dy, dx) * 180 / Math.PI;
      let pct = ((deg + 90 + 360) % 360) / 3.6;
      // don't wrap around at 12 o'clock — pin to the nearest end instead
      if (lastPct !== null && Math.abs(pct - lastPct) > 50) pct = lastPct > 50 ? 100 : 0;
      lastPct = pct;
      // keep a sliver of time while dragging so the alert can't fire mid-drag
      onAction(type, Math.min(100, Math.max(0.3, pct)));
    });
    const end = () => {
      if (!box.classList.contains('scrubbing')) return;
      box.classList.remove('scrubbing');
      if (lastPct !== null) onAction(type, Math.min(100, Math.max(0, lastPct)));
    };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
  }
  attachScrub(els.sitKnob, els.sitBox, 'sit-scrub');
  attachScrub(els.waterKnob, els.waterBox, 'water-scrub');

  function placeKnob(knob, pct, visible) {
    if (!visible) {
      knob.style.display = 'none';
      return;
    }
    const appearing = knob.style.display === 'none' || !knob.style.transform;
    knob.style.display = '';
    // center → rotate → radius, so the transform transition interpolates the
    // angle and the knob glides along the circle even across big jumps
    const deg = (pct / 100) * 360 - 90;
    if (appearing) knob.classList.add('no-anim'); // appear in place, no fly-in
    knob.style.transform = `translate(65px, 65px) rotate(${deg.toFixed(2)}deg) translate(${R}px)`;
    if (appearing) {
      void knob.offsetWidth;
      knob.classList.remove('no-anim');
    }
  }

  // one center element is visible per ring; phase changes shrink the old one
  // out and pop the new one in
  const centers = {
    sit: {
      byPhase: { sitting: els.sitFig, standing: els.standFig, alert: els.sitDisc2, standDone: els.sitDisc1 },
      current: null,
      token: 0,
    },
    water: {
      byPhase: { countdown: els.cupwrap, alert: els.waterDisc2 },
      current: null,
      token: 0,
    },
  };
  for (const g of Object.values(centers)) {
    for (const el of Object.values(g.byPhase)) el.style.display = 'none';
  }

  function setCenter(group, phase) {
    const g = centers[group];
    if (g.current === phase) return;
    g.current = phase;
    const token = ++g.token;
    const next = g.byPhase[phase];
    const leaving = Object.values(g.byPhase).filter((el) => el !== next && el.style.display !== 'none');

    const show = () => {
      if (g.token !== token) return;
      for (const el of leaving) {
        el.style.display = 'none';
        el.classList.remove('pop-out');
      }
      next.classList.remove('pop-in');
      next.style.display = '';
      void next.offsetWidth; // restart the animation
      next.classList.add('pop-in');
    };

    if (leaving.length === 0) {
      show();
    } else {
      for (const el of leaving) el.classList.add('pop-out');
      setTimeout(show, 140);
    }
  }

  function update(view) {
    const { dark, accent, ringWidth, sitPhase, waterPhase } = view;
    const tk = tokens(dark);

    const sitPct = Number(view.sitPct ?? 0);
    const waterPct = waterPhase === 'alert' ? 5 : Number(view.waterPct ?? 0); // ring = remaining
    const sitRingPct = (sitPhase === 'alert' || sitPhase === 'standDone') ? 100 : sitPct;
    // the glass FILLS as time runs out: full glass = time to drink
    const fillPct = 100 - waterPct;
    const level = Math.max(0, Math.min(1, fillPct / 100));

    // ring widths & tracks
    for (const c of [els.sitTrack, els.sitArc, els.waterTrack, els.waterArc]) {
      c.setAttribute('stroke-width', ringWidth);
    }

    // sit ring (styles, not attributes, so the CSS transitions apply)
    const sitRingColor = sitPhase === 'alert' ? RED : (sitPhase === 'standing' ? WARM : accent);
    els.sitArc.style.stroke = sitRingColor;
    els.sitArc.style.strokeDashoffset = (C * (1 - sitRingPct / 100)).toFixed(1);

    // water ring (gradient)
    els.wrA.setAttribute('stop-color', waterPhase === 'alert' ? RED : accent);
    els.wrB.setAttribute('stop-color', waterPhase === 'alert'
      ? mix(RED, 0.4, '#FFFFFF')
      : mix(accent, 0.35 + 0.4 * (1 - level), '#FFFFFF'));
    els.waterArc.style.strokeDashoffset = (C * (1 - waterPct / 100)).toFixed(1);

    // center content (animated swap on phase change)
    setCenter('sit', sitPhase);
    setCenter('water', waterPhase === 'alert' ? 'alert' : 'countdown');

    // disc primary = solid accent (the disc surface itself is opaque)
    for (const b of els.primaries) b.style.background = accent;

    // draggable handles, only while a countdown is running
    placeKnob(els.sitKnob, sitRingPct, sitPhase === 'sitting' || sitPhase === 'standing');
    placeKnob(els.waterKnob, waterPct, waterPhase === 'countdown');

    // captions
    els.sitCaption.textContent = view.sitCaption;
    els.sitCaption.style.color = sitPhase === 'alert' ? RED : '';
    els.waterCaption.textContent = view.waterCaption;
    els.waterCaption.style.color = waterPhase === 'alert' ? RED : '';

    // water glass
    const g = waterGeom(fillPct);
    els.waterBody.setAttribute('d', g.waterBodyD);
    els.wave2.setAttribute('d', g.waveLine2D);
    els.wave2.setAttribute('opacity', g.waveOpacity);
    els.surface.setAttribute('d', g.surfaceD);
    els.surface.setAttribute('stroke', mix(accent, 0.5, '#FFFFFF'));
    els.wgGrad.setAttribute('y1', g.waterY);
    els.wgTop.setAttribute('stop-color', mix(accent, 0.15, '#FFFFFF'));
    els.wgBot.setAttribute('stop-color', mix(accent, 0.3, '#1B8E9E'));
    els.cupBody.setAttribute('stroke', tk.iconBase);
    els.cupRim.setAttribute('stroke', tk.iconBase);
    els.cupHi.setAttribute('stroke', tk.glassHi);
    els.sitTrack.setAttribute('stroke', dark ? 'rgba(255,255,255,0.10)' : 'rgba(28,36,44,0.09)');
    els.waterTrack.setAttribute('stroke', dark ? 'rgba(255,255,255,0.10)' : 'rgba(28,36,44,0.09)');
  }

  return update;
}
