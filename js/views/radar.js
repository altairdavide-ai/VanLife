/* RADAR — mappa con l'eco radar delle precipitazioni (RainViewer): due ore di
   passato e mezz'ora di nowcast, per capire se il fronte ti passa addosso. */

import { h, clear, hhmm, num, toast, buzz } from '../util.js';
import { S, setSetting } from '../store.js';
import { G, geo, once as geoOnce } from '../geo.js';
import * as wx from '../weather.js';
import { drawNowcast, autoRedraw } from '../ui.js';

const BASES = {
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19,
    attr: '© OpenStreetMap', label: 'Strade' },
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', max: 20,
    attr: '© OpenStreetMap, © CARTO', label: 'Notte' },
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19,
    attr: 'Esri, Maxar, Earthstar Geographics', label: 'Satellite' },
  topo: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', max: 17,
    attr: '© OpenStreetMap, © OpenTopoMap (CC-BY-SA)', label: 'Topo' },
};

/* Quanti fotogrammi passati tenere: RainViewer ne pubblica ~13 (2 ore).
   Su un tablet ogni fotogramma e' un livello di tasselli, quindi non esageriamo. */
const MAX_PAST = 10;

export default {
  id: 'radar', title: 'Radar', icon: '🛰️',
  mount(el, ctx) {
    clear(el);
    let map = null, baseLayer = null;
    const layers = new Map();          // path -> L.TileLayer
    let frames = [], idx = 0, playing = true, timer = null;
    let follow = true, mode = 'radar';
    let selfMarker = null, accCircle = null;
    let tilesOk = 0, tilesKo = 0, loading = false;
    const spotLayer = window.L ? L.layerGroup() : null;

    /* ---------- struttura ---------- */
    const tsEl = h('span.ts', '--:--');
    const slider = h('input', { type: 'range', min: 0, max: 0, value: 0, step: 1 });
    const marks = h('div.tl-marks');
    const playBtn = h('button.icon-btn', { title: 'Play/pausa' }, '⏸');
    const nowcastCv = h('canvas.chart', { style: { height: '74px' } });
    const noteEl = h('div.map-note', { hidden: true });
    const diagEl = h('pre.diag', { hidden: true });

    const hud = h('div.map-hud',
      h('div.line',
        playBtn,
        h('div.timeline', marks, slider),
        tsEl),
      noteEl,
      h('div.line', { style: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } },
        h('div.legend', 'debole', h('span.sc'), 'forte'),
        h('div.row', { style: { gap: '6px' } },
          h('button.btn.sm', { onclick: () => { follow = !follow; toast(follow ? 'Mappa agganciata alla tua posizione' : 'Mappa libera'); if (follow) center(); } }, '🎯 Segui'),
          h('button.btn.sm', { onclick: cycleMode }, '🌧️ Radar/IR'),
          h('button.btn.sm', { onclick: cycleBase }, '🗺️ Sfondo'))));

    const wrap = h('div.mapwrap', h('div', { id: 'map' }), hud);

    el.append(
      h('div.page-head', h('h2', 'Radar pioggia'),
        h('span.sub', 'RainViewer · 2 h di passato + 30′ di previsione'),
        h('span.spacer'),
        h('button.btn.sm', { onclick: reload }, '⟳ Aggiorna')),
      wrap,
      h('div.grid.wide', { style: { marginTop: '12px' } },
        h('div.card', h('h3', 'Sopra di te, nelle prossime ore'), nowcastCv,
          h('div', { id: 'rv-summary', class: 'mute', style: { fontSize: '12.5px', marginTop: '6px' } })),
        h('div.card', h('h3', 'Come si legge'),
          h('p.mute', { style: { fontSize: '12.5px', lineHeight: 1.55, margin: 0 } },
            'Le macchie colorate sono l\'eco dei radar meteo: azzurro pioggia debole, giallo/arancio rovescio, ',
            'rosso e viola grandine o temporale forte. I fotogrammi con l\'orario in ciano sono previsione, non misura. ',
            'Guarda in che direzione si muovono le macchie: se la scia punta verso il puntino ciano, la prendi in pieno.'),
          h('div.row', { style: { gap: '6px', marginTop: '10px' } },
            h('button.btn.sm.ghost', { onclick: () => { diagEl.hidden = !diagEl.hidden; if (!diagEl.hidden) paintDiag(); } }, '🩺 Diagnostica')),
          diagEl)));

    updateNowcastCard();

    /* ---------- messaggi in mappa ---------- */
    function note(txt, kind = '') {
      noteEl.hidden = !txt;
      noteEl.className = 'map-note' + (kind ? ' ' + kind : '');
      clear(noteEl);
      if (!txt) return;
      noteEl.append(h('span', txt));
      if (kind === 'bad') noteEl.append(h('button.btn.sm', { onclick: reload }, 'Riprova'));
    }

    /* ---------- mappa ---------- */
    /* Leaflet misura il contenitore al momento della creazione: se la sezione si
       monta mentre lo schermo di accensione la copre, o prima che il layout sia
       calcolato, la mappa nasce 0x0 e non carica un solo tassello. Quindi
       aspettiamo che il contenitore abbia un'altezza vera. */
    let initTries = 0;
    function initMap() {
      if (!window.L) { note('Libreria mappa non caricata: ricarica la pagina.', 'bad'); return; }
      if (!wrap.isConnected) return;
      const r = wrap.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) {
        if (initTries++ < 90) { requestAnimationFrame(initMap); return; }
        note('La mappa non trova spazio sullo schermo.', 'bad');
        return;
      }

      const start = G.pos ? [G.pos.lat, G.pos.lon] : [43.5, 12.5];
      map = L.map(wrap.querySelector('#map'), { zoomControl: true, attributionControl: true, tap: true })
        .setView(start, G.pos ? 9 : 6);
      setBase(S.settings.mapStyle);
      spotLayer.addTo(map);
      map.on('dragstart', () => { follow = false; });
      map.whenReady(() => setTimeout(() => map && map.invalidateSize(), 60));
      drawSelf();
      drawSpots();
      loadFrames();
    }

    /* Rotazione del tablet, apertura della tastiera, fine dell'accensione:
       ogni cambio di dimensione va riportato a Leaflet o restano buchi grigi. */
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (map) map.invalidateSize(); }) : null;
    ro?.observe(wrap);
    const onResize = () => { if (map) map.invalidateSize(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    function setBase(key) {
      const b = BASES[key] || BASES.osm;
      if (baseLayer) map.removeLayer(baseLayer);
      // Niente crossOrigin: non leggiamo mai i pixel, e chiedere il CORS a un
      // server di tasselli che non lo concede fa fallire l'immagine e basta.
      baseLayer = L.tileLayer(b.url, { maxZoom: b.max, attribution: b.attr, subdomains: 'abc' }).addTo(map);
      baseLayer.setZIndex(1);
      setSetting('mapStyle', key);
    }

    function cycleBase() {
      const keys = Object.keys(BASES);
      const next = keys[(keys.indexOf(S.settings.mapStyle) + 1) % keys.length];
      setBase(next);
      toast('Sfondo: ' + BASES[next].label);
      buzz();
    }

    function cycleMode() {
      mode = mode === 'radar' ? 'satellite' : 'radar';
      dropLayers();
      toast(mode === 'radar' ? 'Eco radar (pioggia)' : 'Satellite infrarosso (nuvole)');
      loadFrames(true);
    }

    function dropLayers() {
      layers.forEach((l) => { if (map) map.removeLayer(l); });
      layers.clear();
      tilesOk = 0; tilesKo = 0;
    }

    function drawSelf() {
      if (!map || !G.pos) return;
      const ll = [G.pos.lat, G.pos.lon];
      if (!selfMarker) {
        selfMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="self-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).addTo(map);
        accCircle = L.circle(ll, { radius: G.pos.acc || 30, color: '#35d6e5', weight: 1, fillOpacity: .07 }).addTo(map);
      } else {
        selfMarker.setLatLng(ll);
        accCircle.setLatLng(ll).setRadius(G.pos.acc || 30);
      }
      if (follow) center();
    }

    function center() { if (map && G.pos) map.setView([G.pos.lat, G.pos.lon], Math.max(map.getZoom(), 9), { animate: true }); }

    function drawSpots() {
      if (!spotLayer) return;
      spotLayer.clearLayers();
      for (const s of S.spots) {
        L.marker([s.lat, s.lon], {
          icon: L.divIcon({ className: '', html: `<div class="spot-pin"><span>${s.icon || '📍'}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }),
        }).bindPopup(`<b>${s.name}</b><br><small>${s.note || ''}</small>`).addTo(spotLayer);
      }
    }

    /* ---------- fotogrammi radar ---------- */
    async function loadFrames(keepIdx = false) {
      if (!map || loading) return;
      loading = true;
      if (!frames.length) note('Carico i fotogrammi del radar…');
      const meta = await wx.refreshRadar();
      loading = false;
      if (!map) return;

      const st = wx.radarState();
      if (!meta) {
        frames = [];
        tsEl.textContent = 'n/d';
        clear(marks);
        note(navigator.onLine
          ? 'Radar non raggiungibile (' + (st.error || 'errore') + ').'
          : 'Sei offline: il radar ha bisogno di rete.', 'bad');
        paintDiag();
        return;
      }

      const list = mode === 'radar'
        ? [...(meta.radar?.past || []).slice(-MAX_PAST), ...(meta.radar?.nowcast || [])]
        : (meta.satellite?.infrared || []).slice(-MAX_PAST);
      frames = list.map((f) => ({ ...f, host: meta.host, future: f.time * 1000 > Date.now() + 60000 }));
      if (!frames.length) {
        tsEl.textContent = 'n/d';
        note(mode === 'radar' ? 'Nessun fotogramma disponibile adesso.' : 'Satellite non disponibile in questa zona.', 'bad');
        paintDiag();
        return;
      }

      note('');
      slider.max = String(frames.length - 1);
      clear(marks);
      frames.forEach((f) => marks.append(h('i', { class: f.future ? 'fut' : '' })));
      if (!keepIdx) {
        const nowIdx = frames.findIndex((f) => f.future);
        idx = nowIdx > 0 ? nowIdx - 1 : frames.length - 1;
      }
      idx = Math.min(idx, frames.length - 1);
      show(idx);
      if (playing) play();
      paintDiag();
    }

    function layerFor(i) {
      const f = frames[i];
      if (!f || !map) return null;
      if (layers.has(f.path)) return layers.get(f.path);
      const st = S.settings;
      // I tasselli sono chiesti a 256 px, la stessa misura della griglia di
      // Leaflet: chiederli a 512 e disegnarli in 256 sprecava banda e basta.
      const url = mode === 'radar'
        ? `${f.host}${f.path}/256/{z}/{x}/{y}/${st.radarColor ?? 2}/${st.radarSmooth ? 1 : 0}_${st.radarSnow ? 1 : 0}.png`
        : `${f.host}${f.path}/256/{z}/{x}/{y}/0/0_0.png`;
      const l = L.tileLayer(url, { opacity: 0, maxNativeZoom: 12, maxZoom: 20, tileSize: 256, zIndex: 10 });
      l.on('tileload', () => { tilesOk++; });
      l.on('tileerror', () => {
        tilesKo++;
        // Sfondo che carica ma eco che non arriva: meglio dirlo che restare muti.
        if (tilesKo >= 8 && tilesOk === 0) note('I tasselli del radar non si caricano.', 'bad');
      });
      layers.set(f.path, l);
      l.addTo(map);
      return l;
    }

    function show(i) {
      if (!frames.length || !map) return;
      idx = (i + frames.length) % frames.length;
      const cur = layerFor(idx);
      layers.forEach((l) => { if (l !== cur) l.setOpacity(0); });
      cur?.setOpacity(mode === 'radar' ? 0.75 : 0.55);
      layerFor((idx + 1) % frames.length);         // precarica il prossimo
      const f = frames[idx];
      const t = f.time * 1000;
      tsEl.textContent = hhmm(t) + (f.future ? ' →' : '');
      tsEl.className = 'ts' + (f.future ? ' fut' : '');
      slider.value = String(idx);
    }

    function play() {
      stopTimer();
      playing = true; playBtn.textContent = '⏸';
      const step = () => {
        const last = idx === frames.length - 1;
        show(idx + 1);
        timer = setTimeout(step, last ? 1400 : 480);
      };
      timer = setTimeout(step, 480);
    }

    function stopTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function pause() { stopTimer(); playing = false; playBtn.textContent = '▶'; }

    playBtn.onclick = () => { playing ? pause() : play(); buzz(); };
    slider.oninput = () => { pause(); show(Number(slider.value)); };

    async function reload() {
      toast('Aggiorno radar…');
      note('Aggiorno…');
      await wx.refreshRadar(true);
      if (G.pos) await wx.refresh(G.pos, true);
      dropLayers();
      frames = [];
      await loadFrames();
      updateNowcastCard();
    }

    /* ---------- diagnostica ---------- */
    function paintDiag() {
      if (diagEl.hidden) return;
      const st = wx.radarState();
      const r = wrap.getBoundingClientRect();
      diagEl.textContent = [
        `posizione   ${G.pos ? `${G.pos.lat.toFixed(3)}, ${G.pos.lon.toFixed(3)} (±${Math.round(G.pos.acc || 0)}m)` : 'assente — stato ' + G.status}`,
        `rete        ${navigator.onLine ? 'online' : 'OFFLINE'}`,
        `api         ${st.ok ? 'ok' : 'ERRORE: ' + (st.error || 'mai contattata')}`,
        `host        ${st.host || '—'}`,
        `fotogrammi  ${st.past} passati + ${st.nowcast} previsti · in timeline ${frames.length}`,
        `tasselli    ${tilesOk} ok / ${tilesKo} falliti`,
        `mappa       ${Math.round(r.width)}×${Math.round(r.height)} px · leaflet ${window.L?.version || 'assente'}`,
        `modo        ${mode} · sfondo ${S.settings.mapStyle}`,
      ].join('\n');
    }

    function updateNowcastCard() {
      autoRedraw(nowcastCv, (cv) => drawNowcast(cv, wx.minutely(48)));
      const box = el.querySelector('#rv-summary');
      if (!box) return;
      const nr = wx.nextRain();
      if (!nr) { box.textContent = 'Nowcast non disponibile per questa zona.'; return; }
      if (nr.raining) box.textContent = `Sta piovendo (${num(nr.mm, 1)} mm ogni 15′)` + (nr.stopsIn ? `, dovrebbe smettere verso le ${hhmm(Date.now() + nr.stopsIn * 60000)}.` : '.');
      else if (nr.startsIn !== null) box.textContent = `Prima pioggia prevista alle ${hhmm(Date.now() + nr.startsIn * 60000)} (${Math.round(nr.startsIn)} minuti), picco ${num(nr.peak, 1)} mm/15′.`;
      else box.textContent = 'Nessuna precipitazione prevista nelle prossime ore su di te.';
    }

    /* ---------- avvio ---------- */
    if (!G.pos) geoOnce().catch(() => {});
    requestAnimationFrame(initMap);

    const offs = [
      geo.on('pos', () => { drawSelf(); paintDiag(); }),
      wx.wx.on('data', updateNowcastCard),
    ];
    const refreshTimer = setInterval(() => { if (!document.hidden) loadFrames(true); }, 5 * 60 * 1000);

    return () => {
      offs.forEach((f) => f());
      stopTimer();
      clearInterval(refreshTimer);
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (map) { map.remove(); map = null; }
    };
  },
};
