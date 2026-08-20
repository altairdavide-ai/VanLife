/* Meteo (Open-Meteo) + metadati radar (RainViewer). Entrambi gratuiti e senza chiave.
   I dati vengono messi in cache: se resti senza rete, la plancia mostra l'ultimo quadro noto. */

import { Emitter, store, fetchJSON, clamp } from './util.js';

export const wx = new Emitter();

export const W = {
  data: store.get('wx', null),          // risposta Open-Meteo
  at: store.get('wxAt', 0),             // timestamp del fetch
  forPos: store.get('wxPos', null),
  radar: store.get('radarMeta', null),  // frame RainViewer
  radarAt: 0,
  loading: false,
  error: '',
};

const OM = 'https://api.open-meteo.com/v1/forecast';
const RV = 'https://api.rainviewer.com/public/weather-maps.json';

const PARAMS = [
  'current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
  'minutely_15=precipitation,weather_code',
  'hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,cloud_cover,shortwave_radiation,is_day',
  'daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum',
  'timezone=auto', 'forecast_days=7', 'forecast_minutely_15=48', 'wind_speed_unit=kmh', 'past_hours=1',
].join('&');

/** Scarica meteo + radar. force=true ignora la finestra di cache. */
export async function refresh(pos, force = false) {
  if (!pos) return W;
  const fresh = Date.now() - W.at < 8 * 60 * 1000;
  const samePlace = W.forPos && Math.abs(W.forPos.lat - pos.lat) < 0.05 && Math.abs(W.forPos.lon - pos.lon) < 0.05;
  if (!force && fresh && samePlace && W.data) { refreshRadar(); return W; }

  W.loading = true; W.error = '';
  wx.emit('loading', true);
  try {
    const url = `${OM}?latitude=${pos.lat.toFixed(4)}&longitude=${pos.lon.toFixed(4)}&${PARAMS}`;
    const d = await fetchJSON(url, 15000);
    W.data = d;
    W.at = Date.now();
    W.forPos = { lat: pos.lat, lon: pos.lon };
    store.set('wx', d); store.set('wxAt', W.at); store.set('wxPos', W.forPos);
    wx.emit('data', d);
  } catch (e) {
    W.error = e.message || 'errore rete';
    wx.emit('error', W.error);
  } finally {
    W.loading = false;
    wx.emit('loading', false);
  }
  await refreshRadar(force);
  return W;
}

/** Elenco dei frame radar (passato + nowcast) da RainViewer. */
export async function refreshRadar(force = false) {
  if (!force && W.radar && Date.now() - W.radarAt < 4 * 60 * 1000) return W.radar;
  try {
    const d = await fetchJSON(RV, 10000);
    W.radar = d;
    W.radarAt = Date.now();
    store.set('radarMeta', d);
    wx.emit('radar', d);
  } catch { /* il radar puo' mancare: il meteo resta valido */ }
  return W.radar;
}

/* ---------------- codici WMO ---------------- */
const WMO = {
  0: ['Sereno', '☀️', '🌙'], 1: ['Quasi sereno', '🌤️', '🌙'], 2: ['Parz. nuvoloso', '⛅', '☁️'], 3: ['Coperto', '☁️', '☁️'],
  45: ['Nebbia', '🌫️'], 48: ['Nebbia gelata', '🌫️'],
  51: ['Pioviggine debole', '🌦️'], 53: ['Pioviggine', '🌦️'], 55: ['Pioviggine intensa', '🌧️'],
  56: ['Pioviggine gelata', '🌧️'], 57: ['Pioviggine gelata', '🌧️'],
  61: ['Pioggia debole', '🌦️'], 63: ['Pioggia', '🌧️'], 65: ['Pioggia forte', '🌧️'],
  66: ['Pioggia gelata', '🌧️'], 67: ['Pioggia gelata forte', '🌧️'],
  71: ['Neve debole', '🌨️'], 73: ['Neve', '❄️'], 75: ['Neve forte', '❄️'], 77: ['Granuli di neve', '🌨️'],
  80: ['Rovesci deboli', '🌦️'], 81: ['Rovesci', '🌧️'], 82: ['Rovesci violenti', '⛈️'],
  85: ['Rovesci di neve', '🌨️'], 86: ['Rovesci di neve forti', '❄️'],
  95: ['Temporale', '⛈️'], 96: ['Temporale con grandine', '⛈️'], 99: ['Temporale con grandine', '⛈️'],
};

export function wmo(code, isDay = 1) {
  const e = WMO[code] || ['--', '❔'];
  return { label: e[0], icon: (!isDay && e[2]) ? e[2] : e[1] };
}

export const isStormCode = (c) => c >= 95;
export const isSnowCode = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;

/* ---------------- letture derivate ---------------- */

const idxNow = (times) => {
  const now = Date.now();
  for (let i = 0; i < times.length; i++) if (new Date(times[i]).getTime() >= now) return Math.max(0, i - 1);
  return times.length - 1;
};

export function current() {
  const d = W.data;
  if (!d?.current) return null;
  const c = d.current;
  return {
    temp: c.temperature_2m, feels: c.apparent_temperature, hum: c.relative_humidity_2m,
    precip: c.precipitation, code: c.weather_code, isDay: c.is_day,
    clouds: c.cloud_cover, press: c.pressure_msl,
    wind: c.wind_speed_10m, gust: c.wind_gusts_10m, dir: c.wind_direction_10m,
    ...wmo(c.weather_code, c.is_day),
  };
}

/** Serie a 15 minuti (nowcast pioggia) a partire da adesso. */
export function minutely(limit = 32) {
  const m = W.data?.minutely_15;
  if (!m?.time?.length) return [];
  const start = idxNow(m.time);
  const out = [];
  for (let i = start; i < Math.min(m.time.length, start + limit); i++) {
    out.push({ t: new Date(m.time[i]).getTime(), mm: m.precipitation[i] ?? 0, code: m.weather_code?.[i] });
  }
  return out;
}

/** Quando ricomincia (o smette) di piovere sopra di noi. */
export function nextRain(threshold = 0.12) {
  const series = minutely(48);
  if (!series.length) return null;
  const now = Date.now();
  const rainingNow = series[0].mm >= threshold;
  if (rainingNow) {
    let stop = null;
    for (const s of series) { if (s.mm < threshold) { stop = s.t; break; } }
    const peak = Math.max(...series.slice(0, 8).map((s) => s.mm));
    return { raining: true, stopsIn: stop ? (stop - now) / 60000 : null, mm: series[0].mm, peak };
  }
  for (const s of series) {
    if (s.mm >= threshold) {
      let end = null;
      for (const q of series) if (q.t > s.t && q.mm < threshold) { end = q.t; break; }
      const peak = Math.max(...series.filter((q) => q.t >= s.t && q.t <= s.t + 90 * 60000).map((q) => q.mm));
      return { raining: false, startsIn: (s.t - now) / 60000, mm: s.mm, peak,
        lasts: end ? (end - s.t) / 60000 : null, code: s.code };
    }
  }
  return { raining: false, startsIn: null, dry: true };
}

/** Prossime N ore dalla serie oraria. */
export function hours(n = 24) {
  const hr = W.data?.hourly;
  if (!hr?.time?.length) return [];
  const start = idxNow(hr.time);
  const out = [];
  for (let i = start; i < Math.min(hr.time.length, start + n); i++) {
    out.push({
      t: new Date(hr.time[i]).getTime(), temp: hr.temperature_2m[i], feels: hr.apparent_temperature?.[i],
      pop: hr.precipitation_probability?.[i] ?? 0, mm: hr.precipitation?.[i] ?? 0,
      code: hr.weather_code[i], wind: hr.wind_speed_10m?.[i], gust: hr.wind_gusts_10m?.[i],
      dir: hr.wind_direction_10m?.[i], uv: hr.uv_index?.[i], clouds: hr.cloud_cover?.[i],
      rad: hr.shortwave_radiation?.[i] ?? 0, isDay: hr.is_day?.[i],
    });
  }
  return out;
}

export function days(n = 7) {
  const dd = W.data?.daily;
  if (!dd?.time?.length) return [];
  const out = [];
  for (let i = 0; i < Math.min(dd.time.length, n); i++) {
    out.push({
      date: dd.time[i], code: dd.weather_code[i], tmax: dd.temperature_2m_max[i], tmin: dd.temperature_2m_min[i],
      sunrise: dd.sunrise[i], sunset: dd.sunset[i], uv: dd.uv_index_max?.[i],
      mm: dd.precipitation_sum?.[i] ?? 0, pop: dd.precipitation_probability_max?.[i] ?? 0,
      pHours: dd.precipitation_hours?.[i] ?? 0,
      wind: dd.wind_speed_10m_max?.[i], gust: dd.wind_gusts_10m_max?.[i], windDir: dd.wind_direction_10m_dominant?.[i],
      rad: dd.shortwave_radiation_sum?.[i] ?? 0,
    });
  }
  return out;
}

/** Stima l'energia solare producibile oggi/domani con l'impianto configurato.
    shortwave_radiation_sum e' in MJ/m²: /3.6 -> kWh/m², per un pannello standard (1 kWp ~ 1 kW/m² STC). */
export function solarEstimate(wp, dayIndex = 0, efficiency = 0.72) {
  const d = days(dayIndex + 1)[dayIndex];
  if (!d) return null;
  const kwhPerM2 = (d.rad || 0) / 3.6;
  const kwh = kwhPerM2 * (wp / 1000) * efficiency;
  return { kwh: Math.max(0, kwh), wh: Math.max(0, kwh * 1000), kwhPerM2, quality: clamp(kwhPerM2 / 7, 0, 1) };
}

export const dataAge = () => (W.at ? (Date.now() - W.at) / 60000 : null);
export const stale = () => dataAge() === null || dataAge() > 45;
