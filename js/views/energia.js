/* ENERGIA — stato della power station, carichi accesi, autonomia e resa solare.
   La carica si aggiorna a mano (o si legge dall'app ufficiale, che apri da qui). */

import { h, clear, num, relTime, hhmm, buzz, uid, sheet } from '../util.js';
import { S, save } from '../store.js';
import * as wx from '../weather.js';
import { card, ring, drawBars, autoRedraw } from '../ui.js';
import { launchApp } from '../launcher.js';

const EFF = 0.72;   // perdite di regolatore, cavi, angolo dei pannelli

export default {
  id: 'energia', title: 'Energia', icon: '🔋',
  mount(el, ctx) {
    const render = () => {
      clear(el);
      const e = S.energy;
      const loadW = e.loads.filter((l) => l.on).reduce((a, b) => a + b.w, 0);
      const wh = (e.soc / 100) * e.capacityWh;
      const hoursLeft = loadW > 0 ? wh / loadW : null;
      const solToday = wx.solarEstimate(e.solarWp, 0, EFF);
      const solTom = wx.solarEstimate(e.solarWp, 1, EFF);

      // curva di produzione oraria dalla radiazione prevista
      const hrs = wx.hours(24);
      const pts = hrs.map((x) => ({
        v: Math.max(0, ((x.rad || 0) / 1000) * e.solarWp * EFF),
        label: hhmm(x.t), dim: !x.isDay,
      }));
      const cv = h('canvas.chart', { style: { height: '130px' } });
      autoRedraw(cv, (c) => drawBars(c, pts, { unit: 'W', color: 'rgba(255,176,32,.9)' }));

      const bilancio = solToday ? solToday.wh - loadW * 24 : null;

      el.append(
        h('div.page-head', h('h2', 'Energia di bordo'),
          h('span.sub', `${e.capacityWh} Wh · ${e.solarWp} W di pannelli`),
          h('span.spacer'),
          h('button.btn.sm.primary', { onclick: () => launchApp(S.apps.find((a) => /bluetti/i.test(a.name)) || { name: 'Bluetti', pkg: 'net.poweroak.bluetticloud' }) }, '🔋 Apri app Bluetti')),

        h('div.grid.wide',
          h('div.card' + (e.soc <= 20 ? '.alarm' : ''),
            h('h3', 'Stato di carica', h('span.r', `${Math.round(wh)} Wh disponibili`)),
            ring(e.soc, `${Math.round(e.soc)}%`, hoursLeft === null ? 'nessun carico' : relTime(hoursLeft * 60), e.soc <= 20 ? 'red' : e.soc <= 45 ? 'amber' : 'green', 150),
            h('input', { type: 'range', min: 0, max: 100, step: 1, value: e.soc, style: { marginTop: '10px' },
              oninput: (e2) => { e.soc = Number(e2.target.value); save('energy'); render(); } }),
            h('div.row', { style: { justifyContent: 'space-between', gap: '6px' } },
              [0, 25, 50, 75, 100].map((v) => h('button.btn.sm.ghost', { onclick: () => { e.soc = v; save('energy'); buzz(); render(); } }, v + '%'))),
            h('p.mute', { style: { fontSize: '11.5px', marginBottom: 0 } },
              'Leggi la percentuale sul display della power station o nell\'app e riportala qui.')),

          card('Carichi accesi', `${loadW} W`,
            h('div.list', e.loads.map((l) => h('div.item',
              h('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' } },
                h('input', { type: 'checkbox', checked: l.on, onchange: () => { l.on = !l.on; save('energy'); render(); } }),
                h('div.grow', h('div.t', l.name), h('div.s', `${l.w} W · ${num((l.w * 24) / 1000, 2)} kWh/giorno`))),
              h('button.btn.sm.ghost', { onclick: () => editLoad(l, render) }, '⚙')))),
            h('button.btn.sm.block', { style: { marginTop: '8px' }, onclick: () => editLoad(null, render) }, '+ Aggiungi carico'),
            h('div.kv', { style: { marginTop: '8px' } }, h('span.mute', 'Autonomia residua'),
              h('b', { class: hoursLeft !== null && hoursLeft < 6 ? 'red' : '' }, hoursLeft === null ? '—' : relTime(hoursLeft * 60)))),

          h('div.card.span-2',
            h('h3', 'Resa solare prevista', h('span.r', `${e.solarWp} Wp · rendimento ${Math.round(EFF * 100)}%`)),
            cv,
            h('div.row.wrap', { style: { gap: '18px', marginTop: '10px' } },
              h('div', h('small.mute', 'Oggi'), h('div.big.sm.amber', solToday ? num(solToday.kwh, 2) : '--', h('span.u', 'kWh'))),
              h('div', h('small.mute', 'Domani'), h('div.big.sm.amber', solTom ? num(solTom.kwh, 2) : '--', h('span.u', 'kWh'))),
              h('div', h('small.mute', 'Consumo giornaliero'), h('div.big.sm', num((loadW * 24) / 1000, 2), h('span.u', 'kWh'))),
              bilancio !== null
                ? h('div', h('small.mute', 'Bilancio'),
                  h('div.big.sm', { class: bilancio >= 0 ? 'green' : 'red' }, (bilancio >= 0 ? '+' : '') + num(bilancio / 1000, 2), h('span.u', 'kWh')))
                : null),
            h('p.mute', { style: { fontSize: '12px', marginBottom: 0 } },
              bilancio === null ? 'Servono i dati meteo per stimare la resa.'
                : bilancio >= 0
                  ? 'Con questo sole i pannelli coprono i consumi: puoi restare in libera.'
                  : `Mancano ${num(-bilancio / 1000, 2)} kWh: spegni qualcosa o metti in conto una colonnina.`)),

          card('Impianto',
            null,
            h('div.field', h('label', 'Capacità batteria (Wh)'),
              h('input', { type: 'number', value: e.capacityWh, min: 100, step: 50,
                oninput: (ev) => { e.capacityWh = Number(ev.target.value) || 0; save('energy'); } })),
            h('div.field', { style: { marginTop: '10px' } }, h('label', 'Pannelli solari (W di picco)'),
              h('input', { type: 'number', value: e.solarWp, min: 0, step: 10,
                oninput: (ev) => { e.solarWp = Number(ev.target.value) || 0; save('energy'); } })),
            h('button.btn.sm.block', { style: { marginTop: '12px' }, onclick: render }, 'Ricalcola')),

          card('Trucchi da van', null,
            h('div', { style: { fontSize: '12.5px', lineHeight: 1.6 } },
              h('div', '⚡ Il bollitore da 1200 W in 10 minuti si mangia 200 Wh: con il gas ne spendi zero.'),
              h('div', '🧊 Il frigo è il carico costante più pesante: tienilo pieno, rende meglio.'),
              h('div', '☀️ Orienta il van per avere i pannelli liberi dalle ombre tra le 10 e le 16.'),
              h('div', '🔌 In area di sosta con colonnina, ricarica prima la power station: la corrente è già pagata.')))));
    };

    function editLoad(load, done) {
      const isNew = !load;
      sheet(isNew ? 'Nuovo carico' : 'Modifica carico', (close) => {
        const nome = h('input', { type: 'text', value: load?.name || '', placeholder: 'Es. Ventilatore' });
        const watt = h('input', { type: 'number', value: load?.w ?? 50, min: 0 });
        return h('div.stack',
          h('div.field', h('label', 'Nome'), nome),
          h('div.field', h('label', 'Potenza (W)'), watt),
          h('div.row.end', { style: { marginTop: '6px' } },
            !isNew ? h('button.btn.danger', { onclick: () => { S.energy.loads = S.energy.loads.filter((x) => x.id !== load.id); save('energy'); close(); done(); } }, 'Elimina') : null,
            h('button.btn.ghost', { onclick: close }, 'Annulla'),
            h('button.btn.primary', {
              onclick: () => {
                if (isNew) S.energy.loads.push({ id: uid(), name: nome.value || 'Carico', w: Number(watt.value) || 0, on: false });
                else { load.name = nome.value || load.name; load.w = Number(watt.value) || 0; }
                save('energy'); close(); done();
              },
            }, 'Salva')));
      });
    }

    render();
    const off = wx.wx.on('data', render);
    return () => off();
  },
};
