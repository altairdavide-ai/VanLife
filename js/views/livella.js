/* LIVELLA & BUSSOLA — per mettere il van in bolla e per capire dove batterà il sole.
   Appoggia il tablet su un piano del van, tocca "Azzera" e usa i valori. */

import { h, clear, num, clamp, toast, buzz, compassName, hhmm } from '../util.js';
import { S, setSetting } from '../store.js';
import { G } from '../geo.js';
import { tilt, T, start as tiltStart, calibrate, resetCalibration, wedgeAdvice } from '../tilt.js';

function sunAzimuths() {
  if (!G.pos || !window.SunCalc) return null;
  const now = new Date();
  const t = SunCalc.getTimes(now, G.pos.lat, G.pos.lon);
  const az = (d) => (SunCalc.getPosition(d, G.pos.lat, G.pos.lon).azimuth * 180) / Math.PI + 180;
  const alt = (SunCalc.getPosition(now, G.pos.lat, G.pos.lon).altitude * 180) / Math.PI;
  return {
    now: az(now), alt,
    rise: az(new Date(+t.sunrise + 60000)), set: az(new Date(+t.sunset - 60000)),
    riseT: t.sunrise, setT: t.sunset,
    noon: az(t.solarNoon),
  };
}

export default {
  id: 'livella', title: 'Livella', icon: '🫧',
  mount(el, ctx) {
    clear(el);
    let frozen = false, frozenVal = null;

    const ball = h('div.ball');
    const bubble = h('div.bubble',
      h('div.ring', { style: { inset: '18%' } }),
      h('div.ring', { style: { inset: '36%' } }),
      h('div.cross.h'), h('div.cross.v'), ball);

    const pitchEl = h('div.n', '0.0°');
    const rollEl = h('div.n', '0.0°');
    const verdict = h('div', { style: { fontSize: '15px', fontWeight: 600, marginTop: '6px' } }, '—');
    const advice = h('div.stack', { style: { marginTop: '10px' } });

    const dial = h('div.dial');
    const needle = h('div.needle');
    const sunRay = h('div.sun');
    const hdEl = h('div.hd', '—');
    const compass = h('div.compass', dial, needle, sunRay, hdEl,
      h('div.n', 'N'), h('div.s', 'S'), h('div.e', 'E'), h('div.w', 'O'));
    const compassNote = h('p.mute', { style: { fontSize: '12.5px', lineHeight: 1.5 } });

    function paint(state) {
      const st = frozen && frozenVal ? frozenVal : state;
      const tol = S.settings.levelTolDeg;
      const maxDeg = 6;
      const x = clamp(st.roll / maxDeg, -1, 1) * 41;
      const y = clamp(st.pitch / maxDeg, -1, 1) * 41;
      ball.style.transform = `translate(calc(-50% + ${x}%), calc(-50% + ${y}%))`;
      const worst = Math.max(Math.abs(st.pitch), Math.abs(st.roll));
      ball.className = 'ball' + (worst <= tol ? '' : worst <= tol * 2.5 ? ' off' : ' bad');
      pitchEl.textContent = num(st.pitch, 1) + '°';
      rollEl.textContent = num(st.roll, 1) + '°';
      pitchEl.className = 'n ' + (Math.abs(st.pitch) <= tol ? 'green' : 'amber');
      rollEl.className = 'n ' + (Math.abs(st.roll) <= tol ? 'green' : 'amber');

      const adv = wedgeAdvice(st.pitch, st.roll, S.settings.wheelbaseCm, S.settings.trackCm, tol);
      clear(advice);
      if (!st.supported) {
        verdict.textContent = 'Sensore non disponibile';
        verdict.className = 'mute';
        advice.append(h('p.mute', { style: { fontSize: '12.5px' } },
          'Questo tablet non espone l\'accelerometro alla pagina, oppure serve una connessione sicura (https).'));
      } else if (!adv.length) {
        verdict.textContent = '✅ Il van è in bolla';
        verdict.className = 'green';
        advice.append(h('p.mute', { style: { fontSize: '12.5px', margin: 0 } }, 'Puoi inserire il freno e aprire il frigo senza sensi di colpa.'));
      } else {
        verdict.textContent = '⚠️ Da regolare';
        verdict.className = 'amber';
        adv.forEach((a) => advice.append(h('div.item',
          h('div', { style: { fontSize: '20px' } }, '🪵'),
          h('div.grow', h('div.t', a.text), h('div.s', `${a.side} · ${a.cm.toFixed(1)} cm`)))));
      }

      // bussola
      const hd = st.heading;
      if (hd === null || hd === undefined) {
        hdEl.textContent = '—';
        needle.style.opacity = '.25';
      } else {
        needle.style.opacity = '1';
        dial.style.transform = `rotate(${-hd}deg)`;
        hdEl.textContent = `${Math.round(hd)}° ${compassName(hd)}`;
      }
      const s = sunAzimuths();
      if (s) {
        const rel = hd === null || hd === undefined ? s.now : s.now - hd;
        sunRay.style.transform = `rotate(${rel}deg)`;
        sunRay.style.opacity = s.alt > -6 ? '1' : '.25';
        compassNote.innerHTML =
          `Il sole ora è a <b>${Math.round(s.now)}° ${compassName(s.now)}</b>, alto ${Math.round(s.alt)}°.<br>` +
          `Sorge a ${compassName(s.rise)} (${hhmm(s.riseT)}) e tramonta a ${compassName(s.set)} (${hhmm(s.setT)}).<br>` +
          `<span class="mute">Per avere ombra sul lato porta nel pomeriggio, tieni quel lato verso ${compassName((s.set + 180) % 360)}. ` +
          `Per svegliarti con il sole in faccia, punta il lunotto a ${compassName(s.rise)}.</span>`;
      } else {
        sunRay.style.opacity = '0';
        compassNote.textContent = 'Serve la posizione per calcolare dove sta il sole.';
      }
    }

    el.append(
      h('div.page-head', h('h2', 'Livella e bussola'),
        h('span.sub', 'appoggia il tablet su un piano del van'),
        h('span.spacer'),
        h('button.btn.sm', {
          onclick: () => {
            frozen = !frozen;
            frozenVal = frozen ? { ...tilt.state } : null;
            toast(frozen ? 'Lettura congelata' : 'Lettura dal vivo');
            buzz();
          },
        }, '❄️ Congela')),

      h('div.grid.wide',
        h('div.card',
          h('h3', 'Bolla', h('span.r', `tolleranza ±${S.settings.levelTolDeg}°`)),
          h('div.level-wrap', bubble),
          h('div.row', { style: { justifyContent: 'space-around', marginTop: '12px' } },
            h('div.wedge', pitchEl, h('small.mute', 'avanti / dietro')),
            h('div.wedge', rollEl, h('small.mute', 'sinistra / destra'))),
          h('div.center', verdict),
          advice,
          h('div.row', { style: { marginTop: '12px', gap: '8px' } },
            h('button.btn.sm', { onclick: () => { calibrate(); toast('Piano azzerato'); buzz(20); } }, '⊙ Azzera sul piano'),
            h('button.btn.sm.ghost', { onclick: () => { resetCalibration(); toast('Calibrazione annullata'); } }, 'Reset'))),

        h('div.card',
          h('h3', 'Bussola e sole'),
          compass,
          h('div', { style: { marginTop: '14px' } }, compassNote),
          h('div.row', { style: { marginTop: '10px', gap: '8px', flexWrap: 'wrap' } },
            h('span.chip', T.headingAbsolute ? 'nord magnetico' : 'orientamento relativo'))),

        h('div.card',
          h('h3', 'Misure del van'),
          h('p.mute', { style: { fontSize: '12.5px', marginTop: 0 } },
            'Servono per tradurre i gradi in centimetri di zeppa. Misura da mozzo a mozzo.'),
          h('div.field', h('label', 'Passo (asse ant. → post.) cm'),
            h('input', { type: 'number', value: S.settings.wheelbaseCm, min: 100, max: 600,
              oninput: (e) => { setSetting('wheelbaseCm', Number(e.target.value) || 300); paint(tilt.state); } })),
          h('div.field', { style: { marginTop: '10px' } }, h('label', 'Carreggiata (sx → dx) cm'),
            h('input', { type: 'number', value: S.settings.trackCm, min: 80, max: 300,
              oninput: (e) => { setSetting('trackCm', Number(e.target.value) || 170); paint(tilt.state); } })),
          h('div.field', { style: { marginTop: '10px' } }, h('label', `Tolleranza bolla: ${S.settings.levelTolDeg}°`),
            h('input', { type: 'range', min: 0.5, max: 4, step: 0.5, value: S.settings.levelTolDeg,
              oninput: (e) => {
                setSetting('levelTolDeg', Number(e.target.value));
                e.target.previousSibling.textContent = `Tolleranza bolla: ${S.settings.levelTolDeg}°`;
                paint(tilt.state);
              } })),
          h('p.mute', { style: { fontSize: '11.5px', marginBottom: 0 } },
            'Consiglio: metti prima in bolla il lato sinistra/destra con le zeppe, poi sistema avanti/dietro.'))));

    tiltStart().then((ok) => { if (!ok) toast('Sensore di inclinazione non accessibile'); paint(tilt.state); });
    const off = tilt.on('tilt', paint);
    paint(tilt.state);
    const t = setInterval(() => paint(tilt.state), 3000);
    return () => { off(); clearInterval(t); };
  },
};
