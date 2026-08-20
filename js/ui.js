/* Mattoncini visivi riusati dalle varie schermate: barre, grafici, indicatori. */

import { h, clamp, hhmm, num } from './util.js';

export function card(title, right, ...kids) {
  const c = h('div.card');
  if (title) c.append(h('h3', title, right ? h('span.r', right) : null));
  c.append(...kids.flat(9).filter(Boolean));
  return c;
}

export function levelClass(pct, invert = false) {
  const p = invert ? 100 - pct : pct;
  return p <= 20 ? 'low' : p <= 45 ? 'mid' : 'ok';
}

export function bar(pct, opts = {}) {
  const p = clamp(pct, 0, 100);
  const fill = h('i', { class: opts.cls || levelClass(p, opts.invert), style: { width: p + '%' } });
  if (opts.color) fill.style.background = `var(--${opts.color})`;
  return h('div.bar' + (opts.thick ? '.thick' : ''), fill);
}

/** Cerchio-indicatore con percentuale al centro (usato per batteria e sole). */
export function ring(pct, label, sub, color = 'amber', size = 120) {
  const p = clamp(pct, 0, 100);
  const r = 44, c = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  const mk = (attrs) => {
    const e = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  svg.append(mk({ cx: 50, cy: 50, r, fill: 'none', stroke: '#16232e', 'stroke-width': 8 }));
  svg.append(mk({ cx: 50, cy: 50, r, fill: 'none', stroke: `var(--${color})`, 'stroke-width': 8,
    'stroke-linecap': 'round', 'stroke-dasharray': `${(c * p) / 100} ${c}`, transform: 'rotate(-90 50 50)' }));
  const wrap = h('div', { style: { position: 'relative', width: size + 'px', height: size + 'px', margin: '0 auto' } }, svg,
    h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1.15 } },
      h('div', h('div.mono', { style: { fontSize: size / 4.4 + 'px' } }, label),
        sub ? h('small.mute', sub) : null)));
  return wrap;
}

/* ---------------- grafici su canvas ---------------- */
function setupCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = cv.clientWidth || 600, hh = cv.clientHeight || 150;
  cv.width = w * dpr; cv.height = hh * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hh);
  return { ctx, w, h: hh };
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';

/** Temperatura (linea) + precipitazioni (barre) + probabilita' (area tenue). */
export function drawHourly(cv, data) {
  if (!data.length) return;
  const { ctx, w, h: H } = setupCanvas(cv);
  const padL = 30, padR = 26, padT = 16, padB = 22;
  const iw = w - padL - padR, ih = H - padT - padB;
  const temps = data.map((d) => d.temp);
  let tmin = Math.min(...temps), tmax = Math.max(...temps);
  if (tmax - tmin < 4) { const m = (tmax + tmin) / 2; tmin = m - 2; tmax = m + 2; }
  const x = (i) => padL + (iw * i) / Math.max(1, data.length - 1);
  const y = (t) => padT + ih - ((t - tmin) / (tmax - tmin)) * ih;

  // notte
  ctx.fillStyle = 'rgba(76,157,255,.06)';
  data.forEach((d, i) => { if (!d.isDay) ctx.fillRect(x(i) - iw / data.length / 2, padT, iw / data.length, ih); });

  // griglia
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
  for (let g = 0; g <= 2; g++) {
    const yy = padT + (ih * g) / 2;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
  }

  // probabilita' di pioggia (area)
  ctx.beginPath();
  ctx.moveTo(padL, padT + ih);
  data.forEach((d, i) => ctx.lineTo(x(i), padT + ih - (ih * (d.pop || 0)) / 100));
  ctx.lineTo(w - padR, padT + ih); ctx.closePath();
  ctx.fillStyle = 'rgba(53,214,229,.10)'; ctx.fill();

  // millimetri (barre)
  const mmMax = Math.max(1.2, ...data.map((d) => d.mm || 0));
  const bw = Math.max(3, iw / data.length - 3);
  data.forEach((d, i) => {
    if (!d.mm) return;
    const bh = ((d.mm / mmMax) * ih) * 0.6;
    ctx.fillStyle = css('--blue');
    ctx.globalAlpha = .8;
    ctx.fillRect(x(i) - bw / 2, padT + ih - bh, bw, bh);
    ctx.globalAlpha = 1;
  });

  // temperatura
  ctx.beginPath();
  data.forEach((d, i) => (i ? ctx.lineTo(x(i), y(d.temp)) : ctx.moveTo(x(i), y(d.temp))));
  ctx.strokeStyle = css('--amber'); ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineTo(w - padR, padT + ih); ctx.lineTo(padL, padT + ih); ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
  grad.addColorStop(0, 'rgba(255,176,32,.22)'); grad.addColorStop(1, 'rgba(255,176,32,0)');
  ctx.fillStyle = grad; ctx.fill();

  // etichette
  ctx.fillStyle = css('--txt-mute'); ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(tmax)}°`, 4, padT);
  ctx.fillText(`${Math.round(tmin)}°`, 4, padT + ih);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const step = Math.max(1, Math.round(data.length / 6));
  data.forEach((d, i) => { if (i % step === 0) ctx.fillText(hhmm(d.t), x(i), padT + ih + 6); });
  ctx.textAlign = 'left';
}

/** Nowcast pioggia a 15 minuti: barre nette, orizzonte 6-12 ore. */
export function drawNowcast(cv, series) {
  const { ctx, w, h: H } = setupCanvas(cv);
  if (!series.length) {
    ctx.fillStyle = css('--txt-mute'); ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('nowcast a 15 minuti non disponibile qui', 8, H / 2);
    return;
  }
  const padB = 18, padT = 8;
  const ih = H - padB - padT;
  const bw = w / series.length;
  const mmMax = Math.max(1, ...series.map((s) => s.mm));
  series.forEach((s, i) => {
    const bh = (s.mm / mmMax) * ih;
    const col = s.mm >= 2.5 ? css('--red') : s.mm >= 0.8 ? css('--amber') : css('--cyan');
    ctx.fillStyle = s.mm ? col : 'rgba(255,255,255,.05)';
    const barH = s.mm ? Math.max(3, bh) : 2;
    ctx.fillRect(i * bw + 1, padT + ih - barH, Math.max(2, bw - 2), barH);
  });
  ctx.fillStyle = css('--txt-mute'); ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'top';
  const now = series[0].t;
  for (let hh_ = 1; hh_ * 4 < series.length; hh_++) {
    const i = hh_ * 4;
    ctx.fillRect(i * bw, padT, 1, ih);
    ctx.fillText(`+${hh_}h`, i * bw + 3, padT + ih + 4);
  }
  ctx.fillText('ora', 2, padT + ih + 4);
  ctx.textAlign = 'right';
  ctx.fillText(`max ${num(mmMax, 1)} mm/15′`, w - 4, padT);
  ctx.textAlign = 'left';
  return now;
}

/** Arco del sole: dove siamo nella giornata. */
export function drawSunArc(cv, sunrise, sunset, now = Date.now()) {
  const { ctx, w, h: H } = setupCanvas(cv);
  const r = Math.min(w / 2 - 26, H - 26);
  const cx = w / 2, cy = H - 12;
  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
  const total = sunset - sunrise;
  const p = clamp((now - sunrise) / total, 0, 1);
  ctx.strokeStyle = css('--amber'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * p); ctx.stroke();
  const a = Math.PI + Math.PI * p;
  const sx = cx + r * Math.cos(a), sy = cy + r * Math.sin(a);
  const up = now >= sunrise && now <= sunset;
  ctx.fillStyle = up ? css('--amber') : css('--txt-mute');
  ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.fill();
  if (up) { ctx.globalAlpha = .25; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.fillStyle = css('--txt-mute'); ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(hhmm(sunrise), cx - r - 12, cy - 6);
  ctx.textAlign = 'right'; ctx.fillText(hhmm(sunset), cx + r + 12, cy - 6); ctx.textAlign = 'left';
}

/** Richiama il disegno quando il canvas cambia dimensione (rotazione tablet). */
export function autoRedraw(cv, fn) {
  const run = () => { try { fn(cv); } catch (e) { console.warn(e); } };
  requestAnimationFrame(run);
  const ro = new ResizeObserver(run);
  ro.observe(cv);
  return () => ro.disconnect();
}

/** Barre generiche con etichette (usato per la resa solare oraria). */
export function drawBars(cv, points, opts = {}) {
  const { ctx, w, h: H } = setupCanvas(cv);
  if (!points.length) return;
  const padB = 20, padT = 10, padL = 4, padR = 4;
  const ih = H - padB - padT, iw = w - padL - padR;
  const max = opts.max || Math.max(1, ...points.map((p) => p.v));
  const bw = iw / points.length;
  points.forEach((p, i) => {
    const bh = Math.max(1, (p.v / max) * ih);
    ctx.fillStyle = p.v ? (opts.color || css('--amber')) : 'rgba(255,255,255,.05)';
    ctx.globalAlpha = p.dim ? .35 : 1;
    ctx.fillRect(padL + i * bw + 1, padT + ih - bh, Math.max(2, bw - 2), bh);
    ctx.globalAlpha = 1;
  });
  ctx.fillStyle = css('--txt-mute'); ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'top';
  const step = Math.max(1, Math.round(points.length / 6));
  points.forEach((p, i) => { if (i % step === 0 && p.label) ctx.fillText(p.label, padL + i * bw, padT + ih + 5); });
  if (opts.unit) {
    ctx.textAlign = 'right';
    ctx.fillText(`max ${max.toFixed(opts.dec ?? 0)} ${opts.unit}`, w - 4, padT - 2);
    ctx.textAlign = 'left';
  }
}
