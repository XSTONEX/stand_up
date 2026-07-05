// Water-glass fill geometry — ported verbatim from renderVals() in
// design_handoff_standup/StandUpWindow.dc.html (the handoff says: port it verbatim; it's fiddly).

export function waterGeom(waterPct) {
  const level = Math.max(0, Math.min(1, waterPct / 100));
  const yTop = 15, yBot = 37.2;
  const y0 = yBot - level * (yBot - yTop);
  const hw = 9.4 - (y0 - 12) * 0.091;
  const x1 = (24 - hw).toFixed(1), x2 = (24 + hw).toFixed(1);
  const ys = y0.toFixed(1);
  const surfaceD = 'M ' + x1 + ' ' + ys + ' Q ' + (24 - hw / 2).toFixed(1) + ' ' + (y0 - 1.6).toFixed(1) + ' 24 ' + ys + ' T ' + x2 + ' ' + ys;
  const waterBodyD = surfaceD + ' L 38 45 L 10 45 Z';
  const y2 = Math.min(y0 + 2.4, 38.6).toFixed(1);
  const waveLine2D = 'M ' + (24 - hw + 2).toFixed(1) + ' ' + y2 + ' Q 24 ' + (Math.min(y0 + 3.5, 39.3)).toFixed(1) + ' ' + (24 + hw - 2).toFixed(1) + ' ' + y2;

  return {
    level,
    waterY: ys,
    surfaceD,
    waterBodyD,
    waveLine2D,
    waveOpacity: level > 0.12 ? 0.5 : 0,
  };
}
