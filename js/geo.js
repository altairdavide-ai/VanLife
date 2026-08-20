/* Servizio posizione: GPS continuo, ultima posizione nota, nome del luogo. */

import { Emitter, store, distanceM, fetchJSON } from './util.js';

export const geo = new Emitter();

export const G = {
  pos: store.get('lastPos', null),   // {lat, lon, acc, alt, speed, heading, ts}
  place: store.get('lastPlace', null),
  status: 'idle',                    // idle | wait | ok | denied | error
  error: '',
};

let watchId = null;
let lastGeocodeAt = 0;
let lastGeocodePos = null;

function setStatus(s, err = '') {
  G.status = s; G.error = err;
  geo.emit('status', G);
}

function onPos(p) {
  const c = p.coords;
  G.pos = {
    lat: c.latitude, lon: c.longitude,
    acc: c.accuracy, alt: c.altitude, altAcc: c.altitudeAccuracy,
    speed: c.speed === null ? null : c.speed * 3.6,      // km/h
    heading: c.heading, ts: p.timestamp,
  };
  store.set('lastPos', G.pos);
  setStatus('ok');
  geo.emit('pos', G.pos);
  maybeGeocode();
}

function onErr(e) {
  const map = { 1: 'denied', 2: 'error', 3: 'error' };
  const msg = { 1: 'Permesso posizione negato', 2: 'Posizione non disponibile', 3: 'GPS lento: nessun fix' };
  setStatus(map[e.code] || 'error', msg[e.code] || e.message);
}

/** Avvia il monitoraggio continuo (idempotente). */
export function start() {
  if (!navigator.geolocation) return setStatus('error', 'Geolocalizzazione non supportata');
  if (watchId !== null) return;
  setStatus(G.pos ? 'ok' : 'wait');
  watchId = navigator.geolocation.watchPosition(onPos, onErr, {
    enableHighAccuracy: true, maximumAge: 15000, timeout: 30000,
  });
}

export function stop() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
}

/** Un fix singolo e fresco (per "salva questo posto"). */
export function once(opts = {}) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Geolocalizzazione non supportata'));
    navigator.geolocation.getCurrentPosition(
      (p) => { onPos(p); res(G.pos); }, rej,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000, ...opts });
  });
}

/* Nome del luogo: solo quando ci si sposta davvero, per non tempestare il servizio. */
async function maybeGeocode() {
  if (!G.pos) return;
  const moved = !lastGeocodePos || distanceM(lastGeocodePos, G.pos) > 2500;
  if (!moved && Date.now() - lastGeocodeAt < 30 * 60 * 1000) return;
  lastGeocodeAt = Date.now();
  lastGeocodePos = { lat: G.pos.lat, lon: G.pos.lon };
  try {
    const d = await fetchJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${G.pos.lat}&longitude=${G.pos.lon}&localityLanguage=it`, 8000);
    const name = d.city || d.locality || d.principalSubdivision || '';
    const region = d.principalSubdivision && d.principalSubdivision !== name ? d.principalSubdivision : (d.countryName || '');
    if (name) {
      G.place = { name, region, country: d.countryCode || '' };
      store.set('lastPlace', G.place);
      geo.emit('place', G.place);
    }
  } catch { /* offline: restiamo alle coordinate */ }
}

export const hasFix = () => !!G.pos;
