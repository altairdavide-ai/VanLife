/* Utilita' condivise: DOM, formattazione, geometria, storage. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Costruttore di elementi: h('div.card', {onclick}, 'testo', childEl) */
export function h(tag, props, ...kids) {
  const [name, ...cls] = String(tag).split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props && (props.nodeType || Array.isArray(props) || typeof props !== 'object')) {
    kids.unshift(props);
  } else if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/* ---------------- formattazione ---------------- */
export const pad2 = (n) => String(n).padStart(2, '0');
export const hhmm = (d) => `${pad2(new Date(d).getHours())}:${pad2(new Date(d).getMinutes())}`;
export const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '--' : Number(v).toFixed(d));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function relTime(min) {
  if (min === null || min === undefined) return '--';
  if (min < 1) return 'adesso';
  if (min < 60) return `${Math.round(min)} min`;
  const h_ = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h_}h ${m}′` : `${h_}h`;
}

export function dayName(d, short = true) {
  const g = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][new Date(d).getDay()];
  return short ? g.slice(0, 3) : g;
}

export function dateLabel(d = new Date()) {
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const x = new Date(d);
  return `${dayName(x)} ${x.getDate()} ${mesi[x.getMonth()]}`;
}

export const compassName = (deg) => {
  const p = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return p[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
};

/* ---------------- geometria ---------------- */
export function distanceM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearing(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

export function niceDistance(m) {
  if (m === null || m === undefined) return '--';
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

/** Coordinate in gradi/primi/secondi, comode da dettare al telefono. */
export function dms(lat, lon) {
  const one = (v, pos, neg) => {
    const s = v < 0 ? neg : pos;
    v = Math.abs(v);
    const d = Math.floor(v), m = Math.floor((v - d) * 60), sec = ((v - d) * 60 - m) * 60;
    return `${d}°${pad2(m)}′${sec.toFixed(1)}″${s}`;
  };
  return `${one(lat, 'N', 'S')} ${one(lon, 'E', 'O')}`;
}

/* ---------------- storage ---------------- */
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('vl.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem('vl.' + key, JSON.stringify(val)); } catch { /* quota */ }
    return val;
  },
  del(key) { try { localStorage.removeItem('vl.' + key); } catch { /* noop */ } },
};

/* ---------------- eventi ---------------- */
export class Emitter {
  constructor() { this._m = new Map(); }
  on(ev, fn) {
    if (!this._m.has(ev)) this._m.set(ev, new Set());
    this._m.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  off(ev, fn) { this._m.get(ev)?.delete(fn); }
  emit(ev, data) { this._m.get(ev)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }
}

/* ---------------- feedback ---------------- */
export function toast(msg, ms = 2600) {
  const el = h('div.toast', msg);
  $('#toasts').append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms - 300);
  setTimeout(() => el.remove(), ms);
}

export function buzz(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* niente vibrazione */ }
}

/** Piccolo modale; il contenuto riceve una funzione per chiudersi. */
export function sheet(title, build) {
  const bg = h('div.sheet-bg', { onclick: (e) => { if (e.target === bg) close(); } });
  const body = h('div.sheet', h('h3', title));
  const close = () => bg.remove();
  body.append(build(close));
  bg.append(body);
  document.body.append(bg);
  return close;
}

export function confirmSheet(title, text, onYes, yesLabel = 'Conferma') {
  sheet(title, (close) => h('div.stack',
    h('p.dim', { style: { margin: '0 0 6px' } }, text),
    h('div.row.end',
      h('button.btn.ghost', { onclick: close }, 'Annulla'),
      h('button.btn.danger', { onclick: () => { close(); onYes(); } }, yesLabel))));
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** fetch con timeout, cosi' una rete lenta non blocca la plancia. */
export async function fetchJSON(url, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
