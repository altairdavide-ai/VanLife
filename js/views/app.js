/* APP DI BORDO — le scorciatoie alle app native del tablet, in una griglia
   grande abbastanza da centrarla anche su una strada sterrata. */

import { h, clear, toast, buzz, uid, sheet, confirmSheet } from '../util.js';
import { S, save } from '../store.js';
import { G } from '../geo.js';
import { launchApp, navigateTo, share, isAndroid } from '../launcher.js';
import { card } from '../ui.js';

const SUGGERITE = [
  { name: 'Bluetti', icon: '🔋', pkg: 'net.poweroak.bluetticloud' },
  { name: 'Park4Night', icon: '🅿️', pkg: 'net.park4night.app', url: 'https://park4night.com' },
  { name: 'iOverlander', icon: '🌍', pkg: 'com.ioverlander.app', url: 'https://ioverlander.com' },
  { name: 'Google Maps', icon: '🗺️', pkg: 'com.google.android.apps.maps' },
  { name: 'Organic Maps', icon: '🧭', pkg: 'app.organicmaps' },
  { name: 'Komoot', icon: '🥾', pkg: 'de.komoot.android' },
  { name: 'Spotify', icon: '🎵', pkg: 'com.spotify.music' },
  { name: 'YouTube', icon: '▶️', pkg: 'com.google.android.youtube' },
  { name: 'Netflix', icon: '🎬', pkg: 'com.netflix.mediaclient' },
  { name: 'WhatsApp', icon: '💬', pkg: 'com.whatsapp' },
  { name: 'Telegram', icon: '✈️', pkg: 'org.telegram.messenger' },
  { name: 'Meteo', icon: '🌤️', pkg: '', url: 'https://www.windy.com' },
  { name: 'Camper service', icon: '🚿', pkg: '', url: 'https://www.camperlife.it/aree-sosta' },
  { name: 'Fotocamera', icon: '📷', pkg: 'com.android.camera' },
  { name: 'Impostazioni', icon: '⚙️', pkg: 'com.android.settings' },
];

function tile(app, onEdit) {
  let timer = null;
  const el = h('div.app-tile', {
    onclick: () => launchApp(app),
    oncontextmenu: (e) => { e.preventDefault(); onEdit(app); },
    ontouchstart: () => { timer = setTimeout(() => { buzz(30); onEdit(app); }, 600); },
    ontouchend: () => clearTimeout(timer),
    ontouchmove: () => clearTimeout(timer),
  },
  h('div.ico', app.icon || '📱'),
  h('div.nm', app.name));
  return el;
}

function editSheet(app, done) {
  const isNew = !app;
  sheet(isNew ? 'Nuova scorciatoia' : app.name, (close) => {
    const nome = h('input', { type: 'text', value: app?.name || '', placeholder: 'Nome' });
    const icona = h('input', { type: 'text', value: app?.icon || '📱', maxlength: 4 });
    const pkg = h('input', { type: 'text', value: app?.pkg || '', placeholder: 'es. net.poweroak.bluetticloud' });
    const url = h('input', { type: 'text', value: app?.url || '', placeholder: 'https://… (ripiego)' });
    return h('div.stack',
      h('div.row', { style: { gap: '10px' } },
        h('div.field', { style: { width: '76px' } }, h('label', 'Icona'), icona),
        h('div.field', { style: { flex: 1 } }, h('label', 'Nome'), nome)),
      h('div.field', h('label', 'Nome pacchetto Android'), pkg),
      h('p.mute', { style: { fontSize: '11.5px', margin: '-2px 0 0' } },
        'Lo trovi nell\'indirizzo della scheda Play Store: play.google.com/store/apps/details?id=', h('b', 'questo.pezzo.qui')),
      h('div.field', h('label', 'Indirizzo di ripiego'), url),
      h('div.row.end', { style: { marginTop: '8px' } },
        !isNew ? h('button.btn.danger', {
          onclick: () => confirmSheet('Eliminare?', `Rimuovo "${app.name}" dalla griglia.`, () => {
            S.apps = S.apps.filter((a) => a.id !== app.id); save('apps'); close(); done();
          }, 'Elimina'),
        }, 'Elimina') : null,
        h('button.btn.ghost', { onclick: close }, 'Annulla'),
        h('button.btn.primary', {
          onclick: () => {
            const data = { name: nome.value || 'App', icon: icona.value || '📱', pkg: pkg.value.trim(), url: url.value.trim() };
            if (isNew) S.apps.push({ id: uid(), ...data });
            else Object.assign(app, data);
            save('apps'); close(); done();
          },
        }, 'Salva')));
  });
}

export default {
  id: 'app', title: 'App', icon: '📱',
  mount(el, ctx) {
    const render = () => {
      clear(el);
      el.append(
        h('div.page-head', h('h2', 'App di bordo'),
          h('span.sub', 'tocca per aprire · tieni premuto per modificare'),
          h('span.spacer'),
          h('button.btn.sm', { onclick: () => editSheet(null, render) }, '+ Aggiungi')),

        !isAndroid() ? h('div.empty', { style: { marginBottom: '12px' } },
          'Non sei su Android: le scorciatoie apriranno il sito web dell\'app invece dell\'app nativa.') : null,

        h('div.apps', S.apps.map((a) => tile(a, (x) => editSheet(x, render))),
          h('div.app-tile.add', { onclick: () => editSheet(null, render) }, h('div.ico', '＋'), h('div.nm', 'Aggiungi'))),

        h('div.grid.wide', { style: { marginTop: '16px' } },
          card('Azioni rapide', null,
            h('div.row.wrap', { style: { gap: '8px' } },
              h('button.btn.sm', {
                onclick: () => {
                  if (!G.pos) return toast('Nessuna posizione');
                  share('La mia posizione', `Sono qui: ${G.pos.lat.toFixed(5)}, ${G.pos.lon.toFixed(5)}`,
                    `https://www.google.com/maps?q=${G.pos.lat},${G.pos.lon}`);
                },
              }, '📤 Condividi posizione'),
              h('button.btn.sm', { onclick: () => G.pos ? navigateTo(G.pos.lat, G.pos.lon, 'Van') : toast('Nessuna posizione') }, '🧭 Naviga qui'),
              h('button.btn.sm', { onclick: () => window.open('tel:112') }, '🆘 112 Emergenze'),
              h('button.btn.sm', { onclick: () => window.open('https://www.google.com/maps/search/camper+service/@' + (G.pos ? `${G.pos.lat},${G.pos.lon},12z` : ''), '_blank') }, '🚿 Camper service vicini'),
              h('button.btn.sm', { onclick: () => window.open('https://www.google.com/maps/search/supermercato/@' + (G.pos ? `${G.pos.lat},${G.pos.lon},13z` : ''), '_blank') }, '🛒 Supermercati'),
              h('button.btn.sm', { onclick: () => window.open('https://www.google.com/maps/search/lavanderia+self+service/@' + (G.pos ? `${G.pos.lat},${G.pos.lon},13z` : ''), '_blank') }, '🧺 Lavanderie'))),

          card('Suggerite', 'tocca per aggiungerle alla griglia',
            h('div.row.wrap', { style: { gap: '6px' } },
              SUGGERITE.filter((s) => !S.apps.some((a) => a.name === s.name)).map((s) =>
                h('button.btn.sm.ghost', {
                  onclick: () => { S.apps.push({ id: uid(), ...s, url: s.url || '' }); save('apps'); toast(s.name + ' aggiunta'); render(); },
                }, `${s.icon} ${s.name}`)))),

          card('Se un\'app non si apre', null,
            h('p.mute', { style: { fontSize: '12.5px', lineHeight: 1.6, margin: 0 } },
              'Il nome del pacchetto deve essere esatto. Apri il Play Store dal browser, cerca l\'app e ',
              'copia quello che sta dopo ', h('b', 'id='), ' nell\'indirizzo: quello è il pacchetto. ',
              'Tieni premuto sulla piastrella per correggerlo. Se il pacchetto è sbagliato o l\'app non è ',
              'installata, si apre il ripiego (il sito o la scheda del Play Store).'))));
    };
    render();
    return () => {};
  },
};
