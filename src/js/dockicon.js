// Live Dock icon renderer — draws the rings-only app tile from the handoff
// (128 viewBox: rounded square, outer sit ring r38/10, inner water ring r22/8)
// onto a canvas and returns base64 PNG for the shell.

import { mix, RED, WARM } from './theme.js';

const VB = 128;

let canvas = null;

export function drawDockIcon(view, scale = 4) {
  const { dark, accent, sitPhase, waterPhase } = view;
  const sitFrac = (sitPhase === 'alert' || sitPhase === 'standDone') ? 1 : Math.max(0, Math.min(1, view.sitPct / 100));
  const waterFrac = waterPhase === 'alert' ? 0.05 : Math.max(0, Math.min(1, view.waterPct / 100));

  if (!canvas) canvas = document.createElement('canvas');
  if (canvas.width !== VB * scale) canvas.width = canvas.height = VB * scale;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);

  // tile background — sized to the standard macOS icon grid (~80% of canvas)
  const bg = ctx.createLinearGradient(0, 13, 0, 115);
  if (dark) { bg.addColorStop(0, '#232E3D'); bg.addColorStop(1, '#101823'); }
  else { bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(1, '#E7F2F4'); }
  roundRect(ctx, 13, 13, 102, 102, 23);
  ctx.fillStyle = bg;
  ctx.fill();
  roundRect(ctx, 13.5, 13.5, 101, 101, 22.5);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(20,45,55,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const track = dark ? 'rgba(255,255,255,0.13)' : 'rgba(20,45,55,0.09)';
  ctx.lineCap = 'round';

  // outer ring — sitting timer
  const sitColor = sitPhase === 'alert' ? RED : (sitPhase === 'standing' ? WARM : accent);
  ring(ctx, 34, 9, track, 1);
  ring(ctx, 34, 9, sitColor, sitFrac);

  // inner ring — water timer (accent → accentLite gradient)
  const wGrad = ctx.createLinearGradient(0, 0, VB, VB);
  if (waterPhase === 'alert') {
    wGrad.addColorStop(0, RED);
    wGrad.addColorStop(1, mix(RED, 0.4, '#FFFFFF'));
  } else {
    wGrad.addColorStop(0, accent);
    wGrad.addColorStop(1, mix(accent, 0.5, '#FFFFFF'));
  }
  ring(ctx, 20, 7, track, 1);
  ring(ctx, 20, 7, wGrad, waterFrac);

  ctx.restore();
  return canvas.toDataURL('image/png').split(',')[1];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ring(ctx, r, width, style, frac) {
  if (frac <= 0) return;
  ctx.beginPath();
  ctx.arc(64, 64, r, -Math.PI / 2, -Math.PI / 2 + frac * 2 * Math.PI);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}
