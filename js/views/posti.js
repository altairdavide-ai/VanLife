/* POSTI — il taccuino dei luoghi: dove hai parcheggiato, dove si carica l'acqua,
   quella piazzola con vista che non vuoi dimenticare. Tutto salvato sul tablet. */

import { h, clear, uid, toast, buzz, sheet, confirmSheet, distanceM, bearing, niceDistance, compassName, dateLabel, hhmm } from '../util.js';
import { S, save } from '../store.js';
import { G, once as geoOnce } from '../geo.js';
import { navigateTo, share } from '../launcher.js';
import { card } from '../ui.js';

export const TIPI = [
  { k: 'sosta', icon: '🚐', label: 'Sosta / notte' },
  { k: 'parcheggio', icon: '📍', label: 'Dove ho parcheggiato' },
  { k: 'acqua', icon: '💧', label: 'Acqua potabile' },
  { k: 'scarico', icon: '♻️', label: 'Camper service' },
  { k: 'spesa', icon: '🛒', label: 'Spesa' },
  { k: 'benzina', icon: '⛽', label: 'Carburante / GPL' },
  { k: 'panorama', icon: '🌄', label: 'Panorama' },
  { k: 'spiaggia', icon: '🏖️', label: 'Spiaggia / lago' },
  { k: 'lavanderia', icon: '🧺', label: 'Lavanderia' },
  { k: 'evitare', icon: '⛔', label: 'Da evitare' },
];

const tipo = (k) => TIPI.find((t) => t.k === k) || TIPI[0];

function editSheet(spot, done, preset) {
  const isNew = !spot;
  const pos = spot ? { lat: spot.lat, lon: spot.lon } : G.pos;
  if (!pos) { toast('Nessuna posizione disponibile'); return; }
  sheet(isNew ? 'Salva questo posto' : 'Modifica posto', (close) => {
    let kind = spot?.type || preset || 'sosta';
    const nome = h('input', { type: 'text', value: spot?.name || '', placeholder: 'Es. Piazzola sul lago' });
    const note = h('textarea', { rows: 3, placeholder: 'Costo, servizi, come arrivarci, se è tranquillo di notte…' }, spot?.note || '');
    const chips = h('div.tabs');
    const paint = () => {
      clear(chips);
      TIPI.forEach((t) => chips.append(h('button', { class: t.k === kind ? 'on' : '', onclick: () => { kind = t.k; paint(); } }, `${t.icon} ${t.label}`)));
    };
    paint();
    return h('div.stack',
      h('div.field', h('label', 'Nome'), nome),
      h('div.field', h('label', 'Tipo'), chips),
      h('div.field', h('label', 'Note'), note),
      h('div.mono.mute', { style: { fontSize: '11.5px' } }, `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`),
      h('div.row.end', { style: { marginTop: '6px' } },
        !isNew ? h('button.btn.danger', {
          onclick: () => confirmSheet('Eliminare il posto?', spot.name, () => {
            S.spots = S.spots.filter((s) => s.id !== spot.id); save('spots'); close(); done();
          }, 'Elimina'),
        }, 'Elimina') : null,
        h('button.btn.ghost', { onclick: close }, 'Annulla'),
        h('button.btn.primary', {
          onclick: () => {
            const data = { name: nome.value || tipo(kind).label, type: kind, icon: tipo(kind).icon, note: note.value };
            if (isNew) S.spots.unshift({ id: uid(), ts: Date.now(), lat: pos.lat, lon: pos.lon, ...data });
            else Object.assign(spot, data);
            save('spots'); close(); buzz(20); toast('Posto salvato'); done();
          },
        }, 'Salva')));
  });
}

function spotItem(s, rerender) {
  const d = G.pos ? distanceM(G.pos, s) : null;
  const b = G.pos ? bearing(G.pos, s) : null;
  return h('div.item',
    h('div', { style: { fontSize: '22px' } }, s.icon || '📍'),
    h('div.grow',
      h('div.t', s.name),
      h('div.s', [
        d !== null ? `${niceDistance(d)} ${compassName(b)}` : null,
        new Date(s.ts).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
      ].filter(Boolean).join(' · ')),
      s.note ? h('div.s', { style: { color: 'var(--txt-dim)', whiteSpace: 'normal', marginTop: '2px' } }, s.note) : null),
    h('div.row', { style: { gap: '4px' } },
      b !== null ? h('div.mono.cyan', { style: { fontSize: '20px', transform: `rotate(${b}deg)`, width: '26px', textAlign: 'center' } }, '↑') : null,
      h('button.btn.sm', { onclick: () => navigateTo(s.lat, s.lon, s.name) }, '🧭'),
      h('button.btn.sm.ghost', { onclick: () => share(s.name, `${s.name}: ${s.note || ''}`, `https://www.google.com/maps?q=${s.lat},${s.lon}`) }, '📤'),
      h('button.btn.sm.ghost', { onclick: () => editSheet(s, rerender) }, '⚙')));
}

export default {
  id: 'posti', title: 'Posti', icon: '📍',
  mount(el, ctx, params = {}) {
    let filtro = 'tutti';

    const render = () => {
      clear(el);
      const lista = (filtro === 'tutti' ? S.spots : S.spots.filter((s) => s.type === filtro))
        .slice()
        .sort((a, b) => {
          if (!G.pos) return b.ts - a.ts;
          return distanceM(G.pos, a) - distanceM(G.pos, b);
        });

      const parcheggio = S.spots.filter((s) => s.type === 'parcheggio').sort((a, b) => b.ts - a.ts)[0];

      el.append(
        h('div.page-head', h('h2', 'I miei posti'),
          h('span.sub', `${S.spots.length} salvati`),
          h('span.spacer'),
          h('button.btn.sm.primary', { onclick: async () => { if (!G.pos) { toast('Cerco il GPS…'); try { await geoOnce(); } catch { return toast('Posizione non disponibile'); } } editSheet(null, render); } }, '＋ Salva qui')),

        h('div.grid.wide',
          h('div.card.accent',
            h('h3', 'Dove ho parcheggiato'),
            parcheggio
              ? h('div',
                h('div', { style: { fontSize: '15px' } }, parcheggio.name),
                h('small.mute', `${dateLabel(parcheggio.ts)} alle ${hhmm(parcheggio.ts)}${G.pos ? ` · ${niceDistance(distanceM(G.pos, parcheggio))} ${compassName(bearing(G.pos, parcheggio))}` : ''}`),
                h('div.row', { style: { marginTop: '10px', gap: '8px' } },
                  h('button.btn.sm', { onclick: () => navigateTo(parcheggio.lat, parcheggio.lon, 'Van') }, '🧭 Riportami al van'),
                  h('button.btn.sm.ghost', { onclick: () => editSheet(parcheggio, render) }, 'Modifica')))
              : h('p.mute', { style: { fontSize: '12.5px' } }, 'Non hai ancora segnato dove hai lasciato il van.'),
            h('button.btn.block' + (parcheggio ? '.ghost.sm' : '.primary'), { style: { marginTop: '10px' },
              onclick: async () => {
                if (!G.pos) { toast('Cerco il GPS…'); try { await geoOnce(); } catch { return toast('Posizione non disponibile'); } }
                S.spots.unshift({ id: uid(), ts: Date.now(), lat: G.pos.lat, lon: G.pos.lon,
                  name: 'Van parcheggiato', type: 'parcheggio', icon: '📍', note: '' });
                save('spots'); buzz(30); toast('Posizione del van salvata'); render();
              } }, '📍 Segna dove ho parcheggiato ora'),
            h('p.mute', { style: { fontSize: '11.5px', marginBottom: 0 } },
              'Utile quando scendi in paese a piedi e al ritorno tutti i vicoli sembrano uguali.')),

          (() => {
            const conteggi = TIPI.map((t) => ({ t, n: S.spots.filter((s) => s.type === t.k).length })).filter((x) => x.n);
            return card('Riepilogo', null,
              conteggi.length
                ? conteggi.map(({ t, n }) => h('div.kv', h('span', `${t.icon} ${t.label}`), h('b', String(n))))
                : h('p.mute', { style: { fontSize: '12.5px' } }, 'Salva un posto e comparirà qui il riepilogo.'));
          })()),

        h('div.tabs', { style: { marginTop: '14px' } },
          h('button', { class: filtro === 'tutti' ? 'on' : '', onclick: () => { filtro = 'tutti'; render(); } }, 'Tutti'),
          TIPI.filter((t) => S.spots.some((s) => s.type === t.k)).map((t) =>
            h('button', { class: filtro === t.k ? 'on' : '', onclick: () => { filtro = t.k; render(); } }, `${t.icon} ${t.label}`))),

        lista.length
          ? h('div.list', lista.map((s) => spotItem(s, render)))
          : h('div.empty', 'Nessun posto in questa categoria. Tocca “Salva qui” quando trovi qualcosa che vale.'));
    };

    render();
    if (params.action === 'pin') setTimeout(() => editSheet(null, render), 120);
    return () => {};
  },
};
