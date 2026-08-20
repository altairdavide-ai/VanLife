/* PLANCIA — la schermata che guardi appena accendi il tablet. */

import { h, clear, hhmm, num, relTime, dateLabel, compassName, dms, toast, buzz, clamp } from '../util.js';
import { S } from '../store.js';
import { G, geo } from '../geo.js';
import * as wx from '../weather.js';
import { card, bar, ring, drawNowcast, drawSunArc, autoRedraw } from '../ui.js';
import { tilt, T } from '../tilt.js';

function sunInfo() {
  if (!G.pos || !window.SunCalc) return null;
  const now = new Date();
  const t = SunCalc.getTimes(now, G.pos.lat, G.pos.lon);
  const moon = SunCalc.getMoonIllumination(now);
  const posn = SunCalc.getPosition(now, G.pos.lat, G.pos.lon);
  const names = ['🌑 Luna nuova', '🌒 Luna crescente', '🌓 Primo quarto', '🌔 Gibbosa crescente',
    '🌕 Luna piena', '🌖 Gibbosa calante', '🌗 Ultimo quarto', '🌘 Luna calante'];
  const idx = Math.round(moon.phase * 8) % 8;
  return {
    sunrise: t.sunrise, sunset: t.sunset, goldenStart: t.goldenHour, goldenEnd: t.goldenHourEnd,
    dusk: t.dusk, night: t.night, dawn: t.dawn,
    moon: names[idx], moonPct: Math.round(moon.fraction * 100),
    alt: (posn.altitude * 180) / Math.PI, az: (posn.azimuth * 180) / Math.PI + 180,
  };
}

function rainCard() {
  const nr = wx.nextRain();
  if (!nr) return card('Nowcast pioggia', null, h('p.mute', 'Serve una posizione e la rete per il nowcast a 15 minuti.'));
  let cls = 'card good', icon = '🌤️', big = 'Asciutto', sub = 'Nessuna pioggia nelle prossime ore', extra = null;

  if (nr.raining) {
    cls = 'card alarm'; icon = '🌧️';
    big = 'Sta piovendo';
    sub = nr.stopsIn !== null ? `Smette tra circa ${relTime(nr.stopsIn)}` : 'Pioggia continua nelle prossime ore';
    extra = `intensità ${num(nr.mm, 1)} mm/15′`;
  } else if (nr.startsIn !== null) {
    const soon = nr.startsIn <= 60;
    cls = soon ? 'card alarm' : 'card accent';
    icon = nr.peak >= 2 ? '⛈️' : '🌧️';
    big = `Pioggia tra ${relTime(nr.startsIn)}`;
    sub = `Inizio previsto alle ${hhmm(Date.now() + nr.startsIn * 60000)}${nr.lasts ? `, per circa ${relTime(nr.lasts)}` : ''}`;
    extra = nr.peak >= 2 ? 'rovescio intenso: ritira tutto' : 'pioggia debole';
  }

  const cv = h('canvas.chart', { style: { height: '86px' } });
  const c = h('div', { class: cls },
    h('h3', 'Nowcast pioggia', h('span.r', wx.dataAge() !== null ? `agg. ${Math.round(wx.dataAge())}′ fa` : '')),
    h('div.row', { style: { gap: '14px', alignItems: 'center' } },
      h('div', { style: { fontSize: '44px', lineHeight: 1 } }, icon),
      h('div',
        h('div', { style: { fontSize: '22px', fontWeight: 650 } }, big),
        h('div.mute', { style: { fontSize: '12.5px', marginTop: '3px' } }, sub),
        extra ? h('div.mono.mute', { style: { fontSize: '11px', marginTop: '2px' } }, extra) : null)),
    cv);
  autoRedraw(cv, (x) => drawNowcast(x, wx.minutely(48)));
  return c;
}

function windCard() {
  const cur = wx.current();
  if (!cur) return null;
  const gust = cur.gust ?? 0;
  const lim = S.settings.windWarnKmh;
  const state = gust >= lim * 1.7 ? ['red', 'Ritira tutto e cerca riparo'] :
    gust >= lim ? ['amber', 'Chiudi la veranda'] :
      gust >= lim * .6 ? ['amber', 'Veranda con paletti a terra'] : ['green', 'Veranda tranquilla'];
  const arrow = h('div.mono', { style: { fontSize: '30px', transform: `rotate(${(cur.dir ?? 0) + 180}deg)`, transition: 'transform .5s' } }, '↑');
  return card('Vento', compassName(cur.dir ?? 0),
    h('div.row', { style: { gap: '14px' } },
      arrow,
      h('div',
        h('div.big.sm', { class: state[0] }, num(cur.wind, 0), h('span.u', 'km/h')),
        h('small.mute', `raffiche ${num(gust, 0)} km/h`))),
    h('div', { style: { marginTop: '10px' } }, bar(clamp((gust / (lim * 2)) * 100, 0, 100), { cls: state[0] === 'green' ? 'ok' : state[0] === 'amber' ? 'mid' : 'low' })),
    h('div', { class: state[0], style: { fontSize: '12.5px', marginTop: '8px' } }, state[1]));
}

function sunCard() {
  const s = sunInfo();
  if (!s) return null;
  const now = Date.now();
  const cv = h('canvas.chart', { style: { height: '104px' } });
  autoRedraw(cv, (x) => drawSunArc(x, +s.sunrise, +s.sunset, now));
  const toSunset = (+s.sunset - now) / 60000;
  const golden = now < +s.goldenStart && now > +s.goldenHourEnd ? null : s.goldenStart;
  return card('Sole e luna', s.moon,
    cv,
    h('div.kv', h('span.mute', 'Alba'), h('b.amber', hhmm(s.sunrise))),
    h('div.kv', h('span.mute', 'Tramonto'), h('b.amber', hhmm(s.sunset))),
    toSunset > 0 ? h('div.kv', h('span.mute', 'Manca al tramonto'), h('b', relTime(toSunset))) : null,
    golden ? h('div.kv', h('span.mute', 'Ora d\'oro'), h('b.amber', `${hhmm(s.goldenStart)} → ${hhmm(s.dusk)}`)) : null,
    h('div.kv', h('span.mute', 'Luna illuminata'), h('b', s.moonPct + '%')));
}

function posCard(ctx) {
  const p = G.pos;
  const place = G.place;
  const copy = async () => {
    if (!p) return;
    const txt = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
    try { await navigator.clipboard.writeText(txt); toast('Coordinate copiate: ' + txt); }
    catch { toast(txt); }
    buzz();
  };
  return card('Posizione', G.status === 'ok' ? 'fix GPS' : G.status,
    p ? h('div',
      h('div', { style: { fontSize: '18px', fontWeight: 600 } }, place ? place.name : 'Posizione acquisita'),
      place?.region ? h('small.mute', place.region) : null,
      h('div.mono.cyan', { style: { fontSize: '13px', marginTop: '8px' } }, `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`),
      h('div.mono.mute', { style: { fontSize: '11px' } }, dms(p.lat, p.lon)),
      h('div.row.wrap', { style: { marginTop: '10px', gap: '6px' } },
        h('span.chip', `± ${num(p.acc, 0)} m`),
        p.alt !== null && p.alt !== undefined ? h('span.chip', `${num(p.alt, 0)} m slm`) : null,
        p.speed ? h('span.chip', `${num(p.speed, 0)} km/h`) : null),
      h('div.row', { style: { marginTop: '12px', gap: '8px' } },
        h('button.btn.sm', { onclick: copy }, '📋 Copia'),
        h('button.btn.sm', { onclick: () => ctx.goto('posti', { action: 'pin' }) }, '📍 Salva posto'),
        h('button.btn.sm', { onclick: () => window.open(`https://www.google.com/maps?q=${p.lat},${p.lon}`, '_blank') }, '🗺️ Mappe')))
      : h('div.stack',
        h('p.mute', G.status === 'denied'
          ? 'Permesso posizione negato. Abilitalo dalle impostazioni del browser per radar e avvisi geolocalizzati.'
          : 'Sto cercando il segnale GPS…'),
        h('button.btn.primary', { onclick: () => ctx.locate() }, 'Attiva posizione')));
}

function tanksCard(ctx) {
  const rows = Object.entries(S.tanks).map(([k, t]) => {
    const pct = t.cap ? (t.cur / t.cap) * 100 : 0;
    return h('div', { style: { marginBottom: '9px' } },
      h('div.row', { style: { justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' } },
        h('span', `${t.icon} ${t.label}`),
        h('b.mono', `${num(t.cur, 0)}/${t.cap} ${t.unit}`)),
      bar(pct, { invert: t.invert }));
  });
  return card('Serbatoi', null, rows,
    h('button.btn.sm.block', { style: { marginTop: '6px' }, onclick: () => ctx.goto('bordo') }, 'Gestisci'));
}

function energyCard(ctx) {
  const e = S.energy;
  const sol = wx.solarEstimate(e.solarWp, 0);
  const loadW = e.loads.filter((l) => l.on).reduce((a, b) => a + b.w, 0);
  const wh = (e.soc / 100) * e.capacityWh;
  const hours = loadW > 0 ? wh / loadW : null;
  return card('Energia', `${e.capacityWh} Wh`,
    ring(e.soc, `${Math.round(e.soc)}%`, 'carica', e.soc <= 20 ? 'red' : e.soc <= 45 ? 'amber' : 'green', 118),
    h('div.kv', h('span.mute', 'Carico attuale'), h('b', `${loadW} W`)),
    h('div.kv', h('span.mute', 'Autonomia stimata'), h('b', hours === null ? '—' : relTime(hours * 60))),
    sol ? h('div.kv', h('span.mute', 'Solare oggi'), h('b.amber', `${num(sol.kwh, 2)} kWh`)) : null,
    h('button.btn.sm.block', { style: { marginTop: '8px' }, onclick: () => ctx.goto('energia') }, 'Pannello energia'));
}

function levelCard(ctx) {
  const t = tilt.state;
  const tol = S.settings.levelTolDeg;
  const misurato = T.running && t.supported;
  const ok = Math.abs(t.pitch) <= tol && Math.abs(t.roll) <= tol;
  return card('Livella', misurato ? (ok ? 'in bolla' : 'da regolare') : 'sensore in pausa',
    misurato
      ? h('div.row', { style: { gap: '16px' } },
        h('div.wedge', h('div.n', { class: ok ? 'green' : 'amber' }, num(t.pitch, 1) + '°'), h('small.mute', 'avanti/dietro')),
        h('div.wedge', h('div.n', { class: ok ? 'green' : 'amber' }, num(t.roll, 1) + '°'), h('small.mute', 'sinistra/destra')))
      : h('p.mute', { style: { fontSize: '12.5px', margin: '4px 0 0' } },
        'Apri la livella per accendere l\'accelerometro e vedere di quanto è storto il van.'),
    h('button.btn.sm.block', { style: { marginTop: '10px' }, onclick: () => ctx.goto('livella') }, 'Apri livella'));
}

function heroCard() {
  const cur = wx.current();
  const d0 = wx.days(1)[0];
  const hNow = wx.hours(1)[0];
  if (!cur) {
    return card('Meteo', null, h('p.mute', wx.W.error ? 'Meteo non raggiungibile: ' + wx.W.error : 'In attesa dei dati meteo…'));
  }
  return h('div.card.span-2',
    h('h3', 'Adesso', h('span.r', G.place ? G.place.name : '')),
    h('div.row', { style: { gap: '16px', alignItems: 'center' } },
      h('div', { style: { fontSize: '60px', lineHeight: 1 } }, cur.icon),
      h('div',
        h('div.big.amber', num(cur.temp, 0), h('span.u', '°C')),
        h('div', { style: { fontSize: '15px', marginTop: '2px' } }, cur.label),
        h('small.mute', `percepiti ${num(cur.feels, 0)}° · umidità ${num(cur.hum, 0)}%`)),
      h('div', { style: { marginLeft: 'auto', textAlign: 'right' } },
        d0 ? h('div.mono', { style: { fontSize: '17px' } },
          h('span.red', num(d0.tmax, 0) + '°'), h('span.mute', ' / '), h('span.blue', num(d0.tmin, 0) + '°')) : null,
        d0 ? h('small.mute', `pioggia ${num(d0.mm, 1)} mm · ${Math.round(d0.pop)}%`) : null)),
    h('div.row.wrap', { style: { gap: '8px', marginTop: '14px' } },
      h('span.chip', `💨 ${num(cur.wind, 0)} km/h ${compassName(cur.dir ?? 0)}`),
      h('span.chip', `💧 ${num(cur.hum, 0)}% umidità`),
      h('span.chip', `☁️ ${num(cur.clouds, 0)}% nuvole`),
      h('span.chip', `🔽 ${num(cur.press, 0)} hPa`),
      d0 && d0.uv !== undefined ? h('span.chip' + (d0.uv >= 8 ? '.warn' : ''), `🕶️ UV ${num(d0.uv, 0)}`) : null,
      hNow ? h('span.chip', `☀️ ${num(hNow.rad, 0)} W/m² sui pannelli`) : null));
}

export default {
  id: 'plancia', title: 'Plancia', icon: '🧭',
  mount(el, ctx) {
    const render = () => {
      clear(el);
      el.append(
        h('div.page-head',
          h('h2', S.settings.vanName),
          h('span.sub', dateLabel()),
          h('span.spacer'),
          wx.W.loading ? h('span.chip.warn', 'aggiorno…') : null),
        h('div.grid.wide',
          heroCard(),
          rainCard(),
          windCard(),
          sunCard(),
          posCard(ctx),
          tanksCard(ctx),
          energyCard(ctx),
          levelCard(ctx)),
        h('div.row.wrap', { style: { marginTop: '14px', gap: '8px' } },
          h('button.btn', { onclick: () => ctx.goto('radar') }, '🛰️ Radar pioggia'),
          h('button.btn', { onclick: () => ctx.goto('meteo') }, '📈 Previsioni'),
          h('button.btn', { onclick: () => ctx.goto('checklist') }, '✅ Checklist'),
          h('button.btn', { onclick: () => ctx.goto('app') }, '📱 App di bordo')));
    };
    render();
    const offs = [
      wx.wx.on('data', render), wx.wx.on('loading', render), wx.wx.on('error', render),
      geo.on('pos', render), geo.on('place', render), geo.on('status', render),
    ];
    const t = setInterval(render, 60000);
    return () => { offs.forEach((f) => f()); clearInterval(t); };
  },
};
