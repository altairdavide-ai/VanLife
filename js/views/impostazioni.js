/* IMPOSTAZIONI — soglie degli avvisi, dati del van, backup. */

import { h, clear, toast, confirmSheet, sheet } from '../util.js';
import { S, setSetting, exportAll, importAll, resetAll } from '../store.js';
import { askNotifications } from '../alerts.js';
import { card } from '../ui.js';

function slider(label, key, min, max, step, unit, onChange) {
  const val = h('b.mono.amber', `${S.settings[key]}${unit}`);
  return h('div', { style: { marginBottom: '14px' } },
    h('div.row', { style: { justifyContent: 'space-between' } }, h('span', label), val),
    h('input', { type: 'range', min, max, step, value: S.settings[key],
      oninput: (e) => { setSetting(key, Number(e.target.value)); val.textContent = `${S.settings[key]}${unit}`; onChange?.(); } }));
}

function toggle(label, desc, key, onChange) {
  return h('label.item', { style: { cursor: 'pointer' } },
    h('input', { type: 'checkbox', checked: !!S.settings[key],
      onchange: async (e) => { await onChange?.(e.target.checked, e.target); setSetting(key, !!S.settings[key]); } }),
    h('div.grow', h('div.t', label), h('div.s', { style: { whiteSpace: 'normal' } }, desc)));
}

export default {
  id: 'impostazioni', title: 'Setup', icon: '⚙️',
  mount(el, ctx) {
    const render = () => {
      clear(el);
      el.append(
        h('div.page-head', h('h2', 'Impostazioni'), h('span.sub', 'tutto resta su questo tablet')),

        h('div.grid.wide',
          card('Il van', null,
            h('div.field', h('label', 'Nome'),
              h('input', { type: 'text', value: S.settings.vanName, oninput: (e) => setSetting('vanName', e.target.value) })),
            h('div.field', { style: { marginTop: '10px' } }, h('label', 'Persone a bordo'),
              h('input', { type: 'number', min: 1, max: 9, value: S.settings.people,
                oninput: (e) => setSetting('people', Number(e.target.value) || 1) })),
            h('div.field', { style: { marginTop: '10px' } }, h('label', 'Passo (cm)'),
              h('input', { type: 'number', value: S.settings.wheelbaseCm, oninput: (e) => setSetting('wheelbaseCm', Number(e.target.value) || 300) })),
            h('div.field', { style: { marginTop: '10px' } }, h('label', 'Carreggiata (cm)'),
              h('input', { type: 'number', value: S.settings.trackCm, oninput: (e) => setSetting('trackCm', Number(e.target.value) || 170) }))),

          card('Soglie degli avvisi', null,
            slider('Vento: avvisa oltre', 'windWarnKmh', 20, 90, 5, ' km/h'),
            slider('Pioggia: anticipo', 'rainWarnMin', 15, 180, 15, ' min'),
            slider('Gelo: avvisa sotto', 'frostWarnC', -5, 8, 1, ' °C'),
            slider('Caldo: avvisa sopra', 'heatWarnC', 25, 45, 1, ' °C'),
            slider('Tramonto: preavviso', 'sunsetWarnMin', 15, 180, 15, ' min'),
            h('p.mute', { style: { fontSize: '11.5px', margin: 0 } },
              'Gli avvisi vengono ricalcolati a ogni aggiornamento meteo e quando riapri l\'app.')),

          card('Comportamento', null,
            h('div.list',
              toggle('Notifiche di sistema', 'Avvisi anche quando l\'app è in secondo piano (mentre il tablet è acceso).', 'notify',
                async (want, box) => {
                  if (want) {
                    const ok = await askNotifications();
                    S.settings.notify = ok;
                    box.checked = ok;
                    toast(ok ? 'Notifiche attive' : 'Permesso notifiche negato');
                  } else S.settings.notify = false;
                }),
              toggle('Tieni acceso lo schermo', 'Utile con il tablet fissato al cruscotto e alimentato.', 'keepAwake',
                (want) => { S.settings.keepAwake = want; ctx.wakeLock(want); })),
            h('div', { style: { marginTop: '12px' } }, slider('Aggiorna il meteo ogni', 'autoRefreshMin', 5, 60, 5, ' min')),
            h('div.field', h('label', 'Colori del radar'),
              h('select', { onchange: (e) => setSetting('radarColor', Number(e.target.value)) },
                [[2, 'Universale (consigliato)'], [4, 'Arcobaleno'], [6, 'NEXRAD'], [8, 'Contrasto alto'], [1, 'Classico']].map(([v, l]) =>
                  h('option', { value: v, selected: S.settings.radarColor === v }, l))))),

          card('Backup dei dati', null,
            h('p.mute', { style: { fontSize: '12.5px', marginTop: 0 } },
              'Posti salvati, serbatoi, checklist e impostazioni vivono solo qui. Esportali ogni tanto: se cancelli i dati del browser, spariscono.'),
            h('div.row.wrap', { style: { gap: '8px' } },
              h('button.btn.sm', {
                onclick: () => {
                  const blob = new Blob([exportAll()], { type: 'application/json' });
                  const a = h('a', { href: URL.createObjectURL(blob), download: `vanlife-${new Date().toISOString().slice(0, 10)}.json` });
                  document.body.append(a); a.click(); a.remove();
                  toast('Backup scaricato');
                },
              }, '⬇ Esporta'),
              h('button.btn.sm', {
                onclick: () => {
                  const inp = h('input', { type: 'file', accept: 'application/json', style: { display: 'none' },
                    onchange: async (e) => {
                      const f = e.target.files[0];
                      if (!f) return;
                      try { importAll(await f.text()); toast('Backup ripristinato'); render(); }
                      catch { toast('File non valido'); }
                    } });
                  document.body.append(inp); inp.click(); inp.remove();
                },
              }, '⬆ Importa'),
              h('button.btn.sm.danger', {
                onclick: () => confirmSheet('Cancellare tutto?', 'Torni alle impostazioni di fabbrica: posti, serbatoi, checklist e app personalizzate vengono persi.',
                  () => { resetAll(); toast('Dati azzerati'); render(); }, 'Cancella tutto'),
              }, '🗑 Azzera'))),

          card('Come funziona', null,
            h('div', { style: { fontSize: '12.5px', lineHeight: 1.65 } },
              h('div', '🛰️ ', h('b', 'Radar'), ': immagini RainViewer, aggregate dai radar meteo nazionali.'),
              h('div', '🌦️ ', h('b', 'Previsioni'), ': Open-Meteo, modelli ad alta risoluzione con nowcast a 15 minuti dove disponibile.'),
              h('div', '📍 ', h('b', 'Posizione'), ': GPS del tablet, usata solo dentro l\'app.'),
              h('div', '🔌 ', h('b', 'Offline'), ': l\'app resta utilizzabile e mostra l\'ultimo meteo scaricato; il radar richiede rete.'),
              h('div', '🔒 ', h('b', 'Dati'), ': nessun account, nessun server, niente pubblicità. Tutto in locale.')),
            h('button.btn.sm.ghost.block', { style: { marginTop: '10px' },
              onclick: () => sheet('Crediti e licenze', () => h('div', { style: { fontSize: '12.5px', lineHeight: 1.7 } },
                h('p', 'Dati meteo: Open-Meteo (CC BY 4.0).'),
                h('p', 'Radar: RainViewer.'),
                h('p', 'Mappe: OpenStreetMap contributors, CARTO, OpenTopoMap, Esri World Imagery.'),
                h('p', 'Librerie: Leaflet (BSD-2), SunCalc (BSD-2).'),
                h('p.mute', 'Gli avvisi sono un aiuto, non un bollettino ufficiale di protezione civile. Con allerta meteo seria, fai riferimento ai canali istituzionali.'))),
            }, 'Crediti e licenze')),

          card('Installazione', null,
            h('p.mute', { style: { fontSize: '12.5px', marginTop: 0, lineHeight: 1.6 } },
              'Dal menu di Chrome tocca “Installa app” (o “Aggiungi a schermata Home”): il computer di bordo diventa un\'icona e si apre a schermo intero, senza barra del browser.'),
            h('button.btn.block', { onclick: () => ctx.install() }, '⤓ Installa sul tablet'))));
    };
    render();
    return () => {};
  },
};
