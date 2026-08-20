/* METEO — dal dettaglio delle prossime ore alla settimana, letto con occhi da camperista. */

import { h, clear, hhmm, num, dayName, compassName } from '../util.js';
import { S } from '../store.js';
import { G } from '../geo.js';
import * as wx from '../weather.js';
import { card, bar, drawHourly, autoRedraw } from '../ui.js';

function hourStrip(hours) {
  return h('div.row', { style: { gap: '10px', overflowX: 'auto', paddingBottom: '6px' } },
    hours.map((x) => {
      const w = wx.wmo(x.code, x.isDay);
      return h('div.center', { style: { minWidth: '62px' } },
        h('small.mute', hhmm(x.t)),
        h('div', { style: { fontSize: '23px', lineHeight: 1.3 } }, w.icon),
        h('div.mono', { style: { fontSize: '14px' } }, num(x.temp, 0) + '°'),
        x.pop >= 10 ? h('small.cyan', { style: { fontSize: '10px' } }, Math.round(x.pop) + '%') : h('small.mute', { style: { fontSize: '10px' } }, '–'),
        (x.gust ?? 0) >= S.settings.windWarnKmh ? h('small.amber', { style: { fontSize: '10px' } }, '🌬' + num(x.gust, 0)) : null);
    }));
}

function dayRow(d, i) {
  const w = wx.wmo(d.code, 1);
  const windy = (d.gust ?? 0) >= S.settings.windWarnKmh;
  return h('div.item',
    h('div', { style: { width: '52px' } },
      h('div.t', i === 0 ? 'oggi' : dayName(d.date)),
      h('small.mute', new Date(d.date).getDate() + '/' + (new Date(d.date).getMonth() + 1))),
    h('div', { style: { fontSize: '22px', width: '32px' } }, w.icon),
    h('div.grow',
      h('div.t', { style: { fontSize: '13px' } }, w.label),
      h('small.mute', `${num(d.mm, 1)} mm · ${Math.round(d.pop)}% · 🌬 ${num(d.gust, 0)} km/h ${compassName(d.windDir ?? 0)}`)),
    windy ? h('span.chip.warn', 'vento') : null,
    h('div.mono', { style: { textAlign: 'right', minWidth: '74px' } },
      h('span.red', num(d.tmax, 0) + '°'), h('span.mute', ' / '), h('span.blue', num(d.tmin, 0) + '°'),
      h('div', h('small.mute', `☀ ${hhmm(d.sunrise)} · ${hhmm(d.sunset)}`))));
}

function comfortNote(cur, dd) {
  if (!cur || !dd) return null;
  const notes = [];
  if (dd.tmin <= S.settings.frostWarnC) notes.push('🧊 Notte sotto zero o quasi: scarica le grigie e isola i tubi.');
  if (dd.tmax >= S.settings.heatWarnC) notes.push('🥵 Giornata calda: cerca ombra, oscuranti e oblò in aerazione.');
  if ((dd.gust ?? 0) >= S.settings.windWarnKmh) notes.push('🌬️ Raffiche forti: veranda chiusa e antenna giù.');
  if (dd.uv >= 8) notes.push('🕶️ UV alto: crema e pausa all\'ombra tra le 12 e le 16.');
  if (dd.mm >= 10) notes.push('🌧️ Giornata piovosa: buona per un trasferimento o per un museo.');
  if (!notes.length) notes.push('👌 Condizioni tranquille: giornata da veranda aperta.');
  return card('Consigli di bordo', null, notes.map((n) => h('div', { style: { fontSize: '13px', padding: '5px 0' } }, n)));
}

export default {
  id: 'meteo', title: 'Meteo', icon: '📈',
  mount(el, ctx) {
    const render = () => {
      clear(el);
      const cur = wx.current();
      const hrs = wx.hours(24);
      const dd = wx.days(7);
      const age = wx.dataAge();

      el.append(h('div.page-head',
        h('h2', 'Previsioni'),
        h('span.sub', G.place ? `${G.place.name}${G.place.region ? ' · ' + G.place.region : ''}` : 'posizione attuale'),
        h('span.spacer'),
        h('span.chip' + (wx.stale() ? '.warn' : ''), age === null ? 'nessun dato' : `agg. ${Math.round(age)}′ fa`),
        h('button.btn.sm', { onclick: () => ctx.refresh(true) }, '⟳')));

      if (!cur) {
        el.append(h('div.empty', 'Nessun dato meteo. Controlla posizione e connessione, poi tocca ⟳.'));
        return;
      }

      const cv = h('canvas.chart.tall');
      autoRedraw(cv, (c) => drawHourly(c, hrs));

      el.append(h('div.grid.wide',
        h('div.card.span-2', h('h3', 'Prossime 24 ore', h('span.r', 'temperatura · pioggia · probabilità')),
          cv, hourStrip(hrs)),

        card('Adesso', cur.label,
          h('div.row', { style: { gap: '14px', alignItems: 'center' } },
            h('div', { style: { fontSize: '46px' } }, cur.icon),
            h('div', h('div.big.amber', num(cur.temp, 0), h('span.u', '°C')),
              h('small.mute', `percepiti ${num(cur.feels, 0)}°`))),
          h('div.kv', h('span.mute', 'Umidità'), h('b', num(cur.hum, 0) + '%')),
          h('div.kv', h('span.mute', 'Nuvolosità'), h('b', num(cur.clouds, 0) + '%')),
          h('div.kv', h('span.mute', 'Pressione'), h('b', num(cur.press, 0) + ' hPa')),
          h('div.kv', h('span.mute', 'Vento'), h('b', `${num(cur.wind, 0)} km/h ${compassName(cur.dir ?? 0)}`)),
          h('div.kv', h('span.mute', 'Raffiche'), h('b', { class: (cur.gust ?? 0) >= S.settings.windWarnKmh ? 'amber' : '' }, num(cur.gust, 0) + ' km/h'))),

        card('Vento nelle prossime 12 ore', `soglia ${S.settings.windWarnKmh} km/h`,
          hrs.slice(0, 12).map((x) => h('div', { style: { marginBottom: '6px' } },
            h('div.row', { style: { justifyContent: 'space-between', fontSize: '11.5px' } },
              h('span.mute', hhmm(x.t)),
              h('b.mono', `${num(x.wind, 0)} / ${num(x.gust, 0)} km/h ${compassName(x.dir ?? 0)}`)),
            bar(Math.min(100, ((x.gust ?? 0) / (S.settings.windWarnKmh * 2)) * 100),
              { cls: (x.gust ?? 0) >= S.settings.windWarnKmh ? 'low' : (x.gust ?? 0) >= S.settings.windWarnKmh * .6 ? 'mid' : 'ok' })))),

        comfortNote(cur, dd[0]),

        h('div.card.span-2', h('h3', 'Sette giorni'),
          h('div.list', dd.map((d, i) => dayRow(d, i))))));
    };

    render();
    const offs = [wx.wx.on('data', render), wx.wx.on('error', render)];
    return () => offs.forEach((f) => f());
  },
};
