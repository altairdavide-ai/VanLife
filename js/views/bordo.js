/* SERBATOI — acqua chiara, grigie, cassetta e gas, con autonomia stimata.
   Aggiornali a mano: due tocchi dopo la doccia e sai sempre quanto ti resta. */

import { h, clear, num, clamp, toast, buzz, uid, hhmm, relTime, sheet, confirmSheet } from '../util.js';
import { S, save } from '../store.js';
import { card, bar } from '../ui.js';

const LITRI_PERSONA_GIORNO = 18;   // media realistica in van, doccia inclusa

function logUse(key, delta, label) {
  S.usage.unshift({ id: uid(), t: Date.now(), key, delta, label });
  S.usage = S.usage.slice(0, 60);
  save('usage');
}

function change(key, delta, label) {
  const t = S.tanks[key];
  if (!t) return;
  const before = t.cur;
  t.cur = clamp(t.cur + delta, 0, t.cap);
  if (t.cur === before) return;
  save('tanks');
  logUse(key, t.cur - before, label);
  buzz();
}

/** Una doccia consuma chiara e riempie le grigie: le tratto insieme. */
function combo(litri, label) {
  const f = S.tanks.fresh, g = S.tanks.grey;
  if (f) { f.cur = clamp(f.cur - litri, 0, f.cap); }
  if (g) { g.cur = clamp(g.cur + litri * 0.9, 0, g.cap); }
  save('tanks');
  logUse('fresh', -litri, label);
  buzz(20);
  toast(`${label}: -${litri} L`);
}

function tankCard(key, t, rerender) {
  const pct = t.cap ? (t.cur / t.cap) * 100 : 0;
  const critical = t.invert ? pct >= 85 : pct <= 15;
  const days = key === 'fresh'
    ? t.cur / Math.max(1, S.settings.people * LITRI_PERSONA_GIORNO)
    : null;

  const setVal = (v) => { t.cur = clamp(v, 0, t.cap); save('tanks'); rerender(); };

  return h('div.card' + (critical ? '.alarm' : ''),
    h('h3', `${t.icon} ${t.label}`, h('span.r', `${t.cap} ${t.unit}`)),
    h('div.row', { style: { alignItems: 'baseline', gap: '8px' } },
      h('div.big', { class: critical ? 'red' : t.color }, num(t.cur, 0), h('span.u', t.unit)),
      h('span.mute.mono', { style: { marginLeft: 'auto' } }, Math.round(pct) + '%')),
    h('div', { style: { margin: '10px 0' } }, bar(pct, { thick: true, invert: t.invert })),
    days !== null ? h('div.kv', h('span.mute', `Autonomia (${S.settings.people} pers.)`),
      h('b', { class: days < 1 ? 'red' : days < 2 ? 'amber' : 'green' }, days >= 1 ? `~${days.toFixed(1)} giorni` : relTime(days * 24 * 60))) : null,
    h('input', { type: 'range', min: 0, max: t.cap, step: t.cap > 40 ? 1 : 0.5, value: t.cur,
      oninput: (e) => { t.cur = Number(e.target.value); save('tanks'); rerender(); } }),
    h('div.row.wrap', { style: { gap: '6px', marginTop: '6px' } },
      h('button.btn.sm', { onclick: () => { change(key, -t.step, `-${t.step}`); rerender(); } }, `−${t.step}`),
      h('button.btn.sm', { onclick: () => { change(key, t.step, `+${t.step}`); rerender(); } }, `+${t.step}`),
      h('button.btn.sm.ghost', { onclick: () => setVal(0) }, 'Vuoto'),
      h('button.btn.sm.ghost', { onclick: () => setVal(t.cap) }, 'Pieno'),
      h('button.btn.sm.ghost', { onclick: () => editTank(key, t, rerender) }, '⚙')));
}

function editTank(key, t, rerender) {
  sheet(`Modifica ${t.label}`, (close) => {
    const nome = h('input', { type: 'text', value: t.label });
    const cap = h('input', { type: 'number', value: t.cap, min: 1 });
    const unit = h('input', { type: 'text', value: t.unit });
    const step = h('input', { type: 'number', value: t.step, min: 0.5, step: 0.5 });
    return h('div.stack',
      h('div.field', h('label', 'Nome'), nome),
      h('div.field', h('label', 'Capacità'), cap),
      h('div.field', h('label', 'Unità'), unit),
      h('div.field', h('label', 'Passo dei pulsanti'), step),
      h('div.row.end', { style: { marginTop: '6px' } },
        h('button.btn.ghost', { onclick: close }, 'Annulla'),
        h('button.btn.primary', {
          onclick: () => {
            t.label = nome.value || t.label;
            t.cap = Number(cap.value) || t.cap;
            t.unit = unit.value || t.unit;
            t.step = Number(step.value) || t.step;
            t.cur = clamp(t.cur, 0, t.cap);
            save('tanks'); close(); rerender();
          },
        }, 'Salva')));
  });
}

export default {
  id: 'bordo', title: 'Serbatoi', icon: '💧',
  mount(el, ctx) {
    const render = () => {
      clear(el);
      el.append(
        h('div.page-head', h('h2', 'Serbatoi di bordo'),
          h('span.sub', `${S.settings.people} persone a bordo`),
          h('span.spacer'),
          h('button.btn.sm', { onclick: () => { S.tanks.fresh.cur = S.tanks.fresh.cap; S.tanks.grey.cur = 0; S.tanks.wc.cur = 0; save('tanks'); logUse('all', 0, 'camper service'); toast('Camper service registrato'); render(); } }, '🚿 Camper service')),

        h('div.grid.wide',
          Object.entries(S.tanks).map(([k, t]) => tankCard(k, t, render))),

        h('div.grid.wide', { style: { marginTop: '12px' } },
          card('Scorciatoie', 'consumi tipici',
            h('div.row.wrap', { style: { gap: '8px' } },
              h('button.btn.sm', { onclick: () => { combo(25, 'Doccia'); render(); } }, '🚿 Doccia −25 L'),
              h('button.btn.sm', { onclick: () => { combo(8, 'Piatti'); render(); } }, '🍽️ Piatti −8 L'),
              h('button.btn.sm', { onclick: () => { combo(3, 'Lavarsi'); render(); } }, '🪥 Lavarsi −3 L'),
              h('button.btn.sm', { onclick: () => { combo(2, 'Caffè e cucina'); render(); } }, '☕ Cucina −2 L'),
              h('button.btn.sm', { onclick: () => { change('wc', S.tanks.wc.step, 'uso WC'); render(); } }, '🚽 Uso WC'),
              h('button.btn.sm', { onclick: () => { S.tanks.wc.cur = 0; save('tanks'); logUse('wc', 0, 'svuotata cassetta'); render(); } }, '♻️ Svuota cassetta'))),

          card('Ultimi movimenti', S.usage.length ? `${S.usage.length} voci` : null,
            S.usage.length
              ? h('div.list', S.usage.slice(0, 8).map((u) => h('div.item',
                h('div.grow', h('div.t', { style: { fontSize: '13px' } }, u.label),
                  h('div.s', new Date(u.t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + hhmm(u.t))),
                h('b.mono', { class: u.delta < 0 ? 'red' : u.delta > 0 ? 'green' : 'mute' },
                  u.delta ? `${u.delta > 0 ? '+' : ''}${num(u.delta, 0)}` : '—'))))
              : h('div.empty', 'Nessun movimento registrato.'),
            S.usage.length ? h('button.btn.sm.ghost.block', { style: { marginTop: '8px' },
              onclick: () => confirmSheet('Svuotare lo storico?', 'Cancella tutti i movimenti registrati.', () => { S.usage = []; save('usage'); render(); }, 'Cancella') }, 'Svuota storico') : null),

          card('Persone a bordo', `${LITRI_PERSONA_GIORNO} L a testa al giorno`,
            h('div.row', { style: { gap: '10px', justifyContent: 'center' } },
              h('button.btn', { onclick: () => { S.settings.people = Math.max(1, S.settings.people - 1); save('settings'); render(); } }, '−'),
              h('div.big.sm', String(S.settings.people)),
              h('button.btn', { onclick: () => { S.settings.people = Math.min(9, S.settings.people + 1); save('settings'); render(); } }, '+')),
            h('p.mute', { style: { fontSize: '12px', marginBottom: 0 } },
              'Usato per stimare quanti giorni dura l\'acqua chiara.'))));
    };
    render();
    return () => {};
  },
};
