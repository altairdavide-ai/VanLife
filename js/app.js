/* VANLIFE — computer di bordo.
   Questo file è il guscio: accensione, barra delle sezioni, orologio, stato dei
   sistemi, ciclo di aggiornamento e avvisi. Ogni sezione vive in js/views/. */

import { h, $, clear, pad2, dateLabel, toast, buzz, store } from './util.js';
import { S, setSetting, bus } from './store.js';
import * as geoSvc from './geo.js';
import { G, geo } from './geo.js';
import * as wx from './weather.js';
import { alerts, evaluate, dismiss } from './alerts.js';

import plancia from './views/plancia.js';
import radar from './views/radar.js';
import meteo from './views/meteo.js';
import livella from './views/livella.js';
import bordo from './views/bordo.js';
import energia from './views/energia.js';
import posti from './views/posti.js';
import checklist from './views/checklist.js';
import appView from './views/app.js';
import impostazioni from './views/impostazioni.js';

const VIEWS = [plancia, radar, meteo, livella, bordo, energia, posti, checklist, appView, impostazioni];
const byId = (id) => VIEWS.find((v) => v.id === id) || VIEWS[0];

let cleanup = null;
let currentId = null;
let installPrompt = null;
let wakeLockRef = null;

/* ---------------- accensione ---------------- */
const BOOT_LINES = [
  'sistemi di bordo ······ online',
  'gps ··················· aggancio',
  'radar meteo ··········· connesso',
  'serbatoi ·············· letti',
  'buon viaggio.',
];

async function boot() {
  const log = $('#boot-log');
  for (const line of BOOT_LINES) {
    log.append(h('div', line));
    await new Promise((r) => setTimeout(r, 210));
  }
  await new Promise((r) => setTimeout(r, 260));
  $('#boot').classList.add('done');
  setTimeout(() => {
    $('#boot').remove();
    // la sezione attiva puo' essersi montata sotto il velo di accensione:
    // un resize la fa rimisurare (serve alla mappa del radar).
    window.dispatchEvent(new Event('resize'));
  }, 700);
}

/* ---------------- contesto passato alle sezioni ---------------- */
const ctx = {
  goto,
  refresh,
  locate: () => { geoSvc.start(); geoSvc.once().catch(() => toast('Posizione non disponibile')); },
  wakeLock: setWakeLock,
  install: async () => {
    if (!installPrompt) return toast('Usa il menu di Chrome → “Installa app”');
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') toast('Installata!');
    installPrompt = null;
  },
};

/* ---------------- navigazione ---------------- */
function buildRail() {
  const rail = $('#rail');
  clear(rail);
  for (const v of VIEWS) {
    rail.append(h('button', {
      class: v.id === currentId ? 'on' : '',
      dataset: { view: v.id },
      onclick: () => { buzz(); goto(v.id); },
    }, h('i', v.icon), h('span', v.title)));
  }
}

function goto(id, params = {}) {
  const v = byId(id);
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  currentId = v.id;
  setSetting('lastView', v.id);
  const el = $('#view');
  clear(el);
  el.scrollTop = 0;
  try {
    cleanup = v.mount(el, ctx, params) || null;
  } catch (e) {
    console.error(e);
    el.append(h('div.empty', 'Questa sezione ha avuto un problema: ' + e.message));
  }
  buildRail();
  const url = new URL(location.href);
  url.searchParams.set('v', v.id);
  history.replaceState(null, '', url);
}

/* ---------------- orologio e stato ---------------- */
function tickClock() {
  const now = new Date();
  $('#tb-time').textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  $('#tb-date').textContent = dateLabel(now);
}

function paintStatus() {
  const gpsChip = $('#chip-gps');
  const map = { ok: ['ok', '◎ GPS'], wait: ['warn', '◎ CERCO'], denied: ['bad', '◎ NEGATO'], error: ['bad', '◎ NO FIX'], idle: ['', '◎ GPS'] };
  const [cls, txt] = map[G.status] || map.idle;
  gpsChip.className = 'chip ' + cls;
  gpsChip.textContent = txt + (G.pos?.acc ? ` ±${Math.round(G.pos.acc)}m` : '');

  const net = $('#chip-net');
  net.className = 'chip ' + (navigator.onLine ? 'ok' : 'bad');
  net.textContent = navigator.onLine ? '▲ RETE' : '▼ OFFLINE';
}

async function paintBattery() {
  if (!navigator.getBattery) return;
  try {
    const b = await navigator.getBattery();
    const draw = () => {
      const chip = $('#chip-batt');
      chip.hidden = false;
      const pct = Math.round(b.level * 100);
      chip.className = 'chip ' + (b.charging ? 'ok' : pct <= 20 ? 'bad' : '');
      chip.textContent = `${b.charging ? '⚡' : '▮'} ${pct}%`;
    };
    draw();
    b.addEventListener('levelchange', draw);
    b.addEventListener('chargingchange', draw);
  } catch { /* niente batteria esposta */ }
}

/* ---------------- avvisi ---------------- */
let alertsExpanded = false;

function paintAlerts(list) {
  const bar = $('#alertbar');
  clear(bar);
  bar.hidden = !list.length;
  if (!list.length) return;
  const limit = alertsExpanded ? list.length : 2;
  for (const a of list.slice(0, limit)) {
    bar.append(h('div', { class: `alert lv-${a.level}` },
      h('div.ic', a.icon),
      h('div.grow', h('div.t', a.title), h('div.d', a.text)),
      h('button.x', { onclick: () => { dismiss(a.key); buzz(); } }, '✕')));
  }
  if (list.length > limit) {
    bar.append(h('button.btn.sm.ghost', { onclick: () => { alertsExpanded = true; paintAlerts(list); } },
      `+${list.length - limit} altri avvisi`));
  } else if (alertsExpanded && list.length > 2) {
    bar.append(h('button.btn.sm.ghost', { onclick: () => { alertsExpanded = false; paintAlerts(list); } }, 'Mostra meno'));
  }
}

/* ---------------- ciclo dati ---------------- */
async function refresh(force = false) {
  const btn = $('#btn-refresh');
  btn.classList.add('spin');
  try {
    if (G.pos) await wx.refresh(G.pos, force);
    evaluate();
  } finally {
    setTimeout(() => btn.classList.remove('spin'), 500);
  }
}

/* ---------------- schermo ---------------- */
async function setWakeLock(want) {
  try {
    if (want && 'wakeLock' in navigator) {
      wakeLockRef = await navigator.wakeLock.request('screen');
      wakeLockRef.addEventListener?.('release', () => { wakeLockRef = null; });
    } else if (!want && wakeLockRef) {
      await wakeLockRef.release();
      wakeLockRef = null;
    }
  } catch { /* alcune webview lo negano */ }
}

function setupChrome() {
  $('#tb-brand').onclick = () => goto('plancia');
  $('#btn-refresh').onclick = () => { buzz(); refresh(true); toast('Aggiorno meteo e radar…'); };

  const veil = $('#veil');
  const nightBtn = $('#btn-night');
  let holdTimer = null;
  const toggleNight = () => {
    const on = veil.hidden;
    veil.hidden = !on;
    nightBtn.classList.toggle('on', on);
    store.set('night', on);
    toast(on ? 'Modalità notte: luce rossa, occhi salvi' : 'Modalità notte disattivata');
  };
  nightBtn.onclick = () => { buzz(); toggleNight(); };
  nightBtn.addEventListener('pointerdown', () => {
    holdTimer = setTimeout(() => { buzz(40); $('#torch').hidden = false; }, 650);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => nightBtn.addEventListener(ev, () => clearTimeout(holdTimer)));
  $('#torch').onclick = () => { $('#torch').hidden = true; };
  if (store.get('night', false)) toggleNight();

  $('#btn-full').onclick = async () => {
    buzz();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { toast('Schermo intero non disponibile'); }
  };

  window.addEventListener('online', () => { paintStatus(); refresh(true); });
  window.addEventListener('offline', paintStatus);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (S.settings.keepAwake) setWakeLock(true);
    if (wx.dataAge() === null || wx.dataAge() > 10) refresh();
    else evaluate();
  });
}

/* ---------------- avvio ---------------- */
async function main() {
  setupChrome();
  buildRail();
  tickClock();
  setInterval(tickClock, 10000);
  paintStatus();
  paintBattery();

  geo.on('status', paintStatus);
  geo.on('pos', () => { paintStatus(); if (wx.dataAge() === null || wx.dataAge() > 20) refresh(); });
  alerts.on('update', paintAlerts);
  wx.wx.on('data', () => evaluate());
  bus.on('change:tanks', () => evaluate());
  bus.on('change:energy', () => evaluate());

  geoSvc.start();
  if (S.settings.keepAwake) setWakeLock(true);

  // Lo shell deve essere misurabile prima di montare qualsiasi sezione: il velo
  // di accensione e' un overlay fisso, quindi copre lo schermo lo stesso.
  $('#shell').hidden = false;

  const params = new URLSearchParams(location.search);
  const start = params.get('v') || S.settings.lastView || 'plancia';
  goto(byId(start).id, { action: params.get('action') });

  boot();
  refresh();
  evaluate();

  setInterval(() => { if (!document.hidden) refresh(); }, Math.max(5, S.settings.autoRefreshMin) * 60 * 1000);

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;   // prima installazione: niente reload
      reloading = true;
      toast('Nuova versione, riavvio…');
      setTimeout(() => location.reload(), 600);
    });
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
      setInterval(() => reg.update(), 30 * 60 * 1000);
    } catch (e) { console.warn('service worker non registrato', e); }
  }
}

main().catch((e) => {
  console.error(e);
  document.body.append(h('div.toast', { style: { position: 'fixed', bottom: '20px', left: '20px' } }, 'Errore di avvio: ' + e.message));
});
