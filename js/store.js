/* Stato dell'app, persistito in localStorage. Tutto locale: nessun account, nessun server. */

import { store, Emitter, uid } from './util.js';

export const bus = new Emitter();

const DEFAULT_APPS = [
  { id: uid(), name: 'Bluetti', icon: '🔋', pkg: 'net.poweroak.bluetticloud', url: '' },
  { id: uid(), name: 'Mappe', icon: '🗺️', pkg: 'com.google.android.apps.maps', url: 'https://maps.google.com' },
  { id: uid(), name: 'Park4Night', icon: '🅿️', pkg: 'net.park4night.app', url: 'https://park4night.com' },
  { id: uid(), name: 'Musica', icon: '🎵', pkg: 'com.spotify.music', url: 'https://open.spotify.com' },
  { id: uid(), name: 'Komoot', icon: '🥾', pkg: 'de.komoot.android', url: 'https://www.komoot.com' },
  { id: uid(), name: 'WhatsApp', icon: '💬', pkg: 'com.whatsapp', url: 'https://web.whatsapp.com' },
];

const DEFAULT_CHECKS = {
  partenza: [
    'Oblò e finestre chiusi', 'Veranda ritirata e bloccata', 'Cavo 220V staccato e riposto',
    'Gas chiuso alla bombola', 'Passo d\'uomo / portellone chiuso', 'Frigo in modalità 12V',
    'Antenna TV abbassata', 'Cunei e zeppe recuperati', 'Scarico grigie fatto', 'Acqua chiara caricata',
    'Tutto fissato in cabina', 'Gradino elettrico rientrato',
  ],
  arrivo: [
    'Van in bolla (usa la livella)', 'Freno a mano + marcia inserita', 'Cunei posizionati',
    'Frigo su gas / 220V', 'Gas aperto', 'Corrente collegata', 'Acque grigie: rubinetto chiuso',
    'Veranda aperta (occhio al vento)', 'Oscuranti pronti',
  ],
  service: [
    'Scarico cassetta WC', 'Risciacquo cassetta + liquido', 'Scarico acque grigie',
    'Carico acqua pulita', 'Pulizia filtro', 'Svuota rifiuti', 'Controllo pressione gomme',
  ],
};

const DEFAULTS = {
  settings: {
    vanName: 'Il mio van',
    people: 2,
    windWarnKmh: 40,
    rainWarnMin: 60,
    frostWarnC: 2,
    heatWarnC: 33,
    sunsetWarnMin: 45,
    notify: false,
    keepAwake: true,
    autoRefreshMin: 10,
    wheelbaseCm: 300,
    trackCm: 170,
    levelTolDeg: 1.5,
    radarColor: 2,
    radarSmooth: true,
    radarSnow: true,
    mapStyle: 'osm',
    lastView: 'plancia',
  },
  tanks: {
    fresh: { label: 'Acqua chiara', icon: '💧', cap: 100, cur: 100, unit: 'L', color: 'cyan', step: 10, invert: false },
    grey: { label: 'Acque grigie', icon: '🫗', cap: 90, cur: 0, unit: 'L', color: 'violet', step: 10, invert: true },
    wc: { label: 'Cassetta WC', icon: '🚽', cap: 20, cur: 0, unit: 'L', color: 'amber', step: 2, invert: true },
    gas: { label: 'Gas', icon: '🔥', cap: 10, cur: 10, unit: 'kg', color: 'amber', step: 1, invert: false },
  },
  energy: { soc: 80, capacityWh: 2048, solarWp: 400, loads: [
    { id: uid(), name: 'Frigo', w: 45, on: true },
    { id: uid(), name: 'Luci LED', w: 12, on: true },
    { id: uid(), name: 'Router / telefoni', w: 15, on: true },
    { id: uid(), name: 'Bollitore', w: 1200, on: false },
    { id: uid(), name: 'Fornetto', w: 900, on: false },
  ] },
  spots: [],
  checks: {},
  apps: DEFAULT_APPS,
  usage: [],     // storico consumi serbatoi
  alertLog: [],  // avvisi gia' mostrati (dedup)
};

function load(key) {
  const raw = store.get(key, null);
  const def = DEFAULTS[key];
  if (raw === null) return structuredClone(def);
  if (Array.isArray(def)) return Array.isArray(raw) ? raw : structuredClone(def);
  if (def && typeof def === 'object') {
    const out = structuredClone(def);
    for (const [k, v] of Object.entries(raw)) {
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && out[k]) ? { ...out[k], ...v } : v;
    }
    return out;
  }
  return raw;
}

export const S = {
  settings: load('settings'),
  tanks: load('tanks'),
  energy: load('energy'),
  spots: load('spots'),
  checks: load('checks'),
  apps: load('apps'),
  usage: load('usage'),
  alertLog: load('alertLog'),
};

/** Salva una sezione e notifica chi ascolta. */
export function save(key) {
  store.set(key, S[key]);
  bus.emit('change:' + key, S[key]);
  bus.emit('change', key);
}

export function setSetting(k, v) {
  S.settings[k] = v;
  save('settings');
}

/* --- checklist: crea le voci di default alla prima apertura --- */
export function checklist(name) {
  if (!S.checks[name]) {
    S.checks[name] = (DEFAULT_CHECKS[name] || []).map((t) => ({ id: uid(), text: t, done: false }));
    save('checks');
  }
  return S.checks[name];
}
export const CHECK_TABS = [
  { key: 'partenza', label: 'Prima di partire', icon: '🚐' },
  { key: 'arrivo', label: 'Arrivo in piazzola', icon: '⛺' },
  { key: 'service', label: 'Camper service', icon: '🚿' },
];
export function resetChecklist(name) {
  S.checks[name] = (DEFAULT_CHECKS[name] || []).map((t) => ({ id: uid(), text: t, done: false }));
  save('checks');
}

export function exportAll() {
  return JSON.stringify({ v: 1, exported: new Date().toISOString(),
    data: { settings: S.settings, tanks: S.tanks, energy: S.energy, spots: S.spots, checks: S.checks, apps: S.apps, usage: S.usage } }, null, 2);
}

export function importAll(json) {
  const parsed = JSON.parse(json);
  const data = parsed.data || parsed;
  for (const k of ['settings', 'tanks', 'energy', 'spots', 'checks', 'apps', 'usage']) {
    if (data[k]) { S[k] = data[k]; save(k); }
  }
}

export function resetAll() {
  for (const k of Object.keys(DEFAULTS)) { store.del(k); S[k] = structuredClone(DEFAULTS[k]); }
  for (const k of Object.keys(DEFAULTS)) save(k);
}
