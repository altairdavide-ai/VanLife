/* Motore degli avvisi: guarda meteo, posizione e stato del van e decide cosa vale
   la pena dirti. Ogni avviso ha una chiave con "secchiello" temporale, cosi' non
   ti ripete la stessa cosa ogni due minuti. */

import { Emitter, store, relTime, hhmm } from './util.js';
import { S } from './store.js';
import * as wx from './weather.js';

export const alerts = new Emitter();
export const A = { active: [], dismissed: store.get('dismissed', {}) };

const bucket = (ms, sizeMin) => Math.floor(ms / (sizeMin * 60000));
const today = () => new Date().toISOString().slice(0, 10);

function build() {
  const out = [];
  const st = S.settings;
  const cur = wx.current();
  const hrs = wx.hours(12);
  const dd = wx.days(2);
  const push = (a) => out.push({ level: 'info', icon: 'ℹ️', ...a });

  /* --- pioggia in arrivo sulla nostra testa --- */
  const nr = wx.nextRain();
  if (nr && !nr.raining && nr.startsIn !== null && nr.startsIn <= st.rainWarnMin) {
    const forte = nr.peak >= 2;
    push({
      key: `rain-${bucket(Date.now() + nr.startsIn * 60000, 20)}`,
      level: forte ? 'danger' : 'warn',
      icon: forte ? '⛈️' : '🌧️',
      title: `Pioggia tra ${relTime(nr.startsIn)}`,
      text: `${forte ? 'Rovescio intenso' : 'Pioggia'} previsto${nr.lasts ? ` per circa ${relTime(nr.lasts)}` : ''}. Ritira veranda, tappeto e panni stesi.`,
      notify: true,
    });
  }
  if (nr?.raining && nr.stopsIn !== null && nr.stopsIn <= 45) {
    push({ key: `rainstop-${bucket(Date.now() + nr.stopsIn * 60000, 30)}`, icon: '🌤️',
      title: `Smette tra ${relTime(nr.stopsIn)}`, text: 'La pioggia sta passando: pronti a riaprire.' });
  }

  /* --- vento: il nemico numero uno di verande e oblo' --- */
  const gust = Math.max(0, ...hrs.slice(0, 8).map((x) => x.gust ?? 0));
  if (gust >= st.windWarnKmh) {
    const when = hrs.slice(0, 8).find((x) => (x.gust ?? 0) >= st.windWarnKmh);
    const estremo = gust >= st.windWarnKmh * 1.7;
    push({
      key: `wind-${today()}-${Math.round(gust / 10)}`,
      level: estremo ? 'danger' : 'warn', icon: '🌬️',
      title: `Raffiche fino a ${Math.round(gust)} km/h`,
      text: `Previste verso le ${hhmm(when?.t || Date.now())}. Chiudi la veranda${estremo ? ', abbassa l\'antenna e valuta di spostarti al riparo' : ' e fissa il tendalino'}.`,
      notify: true,
    });
  }

  /* --- temporali --- */
  const storm = hrs.slice(0, 8).find((x) => wx.isStormCode(x.code));
  if (storm) {
    push({ key: `storm-${bucket(storm.t, 60)}`, level: 'danger', icon: '⚡',
      title: `Temporale verso le ${hhmm(storm.t)}`,
      text: 'Metti via tutto, stacca il cavo 220V dalla colonnina e chiudi gli oblò.', notify: true });
  }

  /* --- neve --- */
  const snow = hrs.slice(0, 12).find((x) => wx.isSnowCode(x.code));
  if (snow) {
    push({ key: `snow-${today()}`, level: 'warn', icon: '❄️', title: 'Neve in arrivo',
      text: `Prevista verso le ${hhmm(snow.t)}. Controlla catene, gas e scarichi.`, notify: true });
  }

  /* --- gelo notturno: tubi e acque grigie --- */
  const tonight = dd[0];
  if (tonight && tonight.tmin <= st.frostWarnC) {
    push({ key: `frost-${tonight.date}`, level: 'warn', icon: '🧊',
      title: `Stanotte ${Math.round(tonight.tmin)}°C`,
      text: 'Rischio gelo: svuota le grigie, isola i tubi e tieni un filo d\'acqua nel sifone.', notify: true });
  }

  /* --- caldo --- */
  if (tonight && tonight.tmax >= st.heatWarnC) {
    push({ key: `heat-${tonight.date}`, icon: '🥵', title: `Oggi fino a ${Math.round(tonight.tmax)}°C`,
      text: 'Parcheggia all\'ombra, oscuranti su e oblò in aerazione.' });
  }

  /* --- UV --- */
  if (tonight && tonight.uv >= 8) {
    push({ key: `uv-${tonight.date}`, icon: '🕶️', title: `UV molto alto (${Math.round(tonight.uv)})`,
      text: 'Crema solare e ombra tra le 12 e le 16.' });
  }

  /* --- tramonto: e' l'ora di trovare il posto per la notte --- */
  if (tonight?.sunset) {
    const mins = (new Date(tonight.sunset).getTime() - Date.now()) / 60000;
    if (mins > 0 && mins <= st.sunsetWarnMin) {
      push({ key: `sunset-${tonight.date}`, icon: '🌇', title: `Tramonto alle ${hhmm(tonight.sunset)}`,
        text: `Mancano ${relTime(mins)}: se non hai ancora un posto per la notte, è il momento.` });
    }
  }

  /* --- serbatoi --- */
  const t = S.tanks;
  const pct = (x) => (x.cap ? (x.cur / x.cap) * 100 : 0);
  if (t.fresh && pct(t.fresh) <= 15) {
    push({ key: `fresh-${Math.round(pct(t.fresh) / 5)}`, level: 'warn', icon: '💧',
      title: 'Acqua chiara agli sgoccioli', text: `Restano circa ${Math.round(t.fresh.cur)} ${t.fresh.unit}. Cerca un camper service.` });
  }
  if (t.grey && pct(t.grey) >= 85) {
    push({ key: `grey-${Math.round(pct(t.grey) / 5)}`, level: 'warn', icon: '🫗',
      title: 'Acque grigie quasi piene', text: 'Meglio scaricare prima di trovarti con il lavello che risale.' });
  }
  if (t.wc && pct(t.wc) >= 85) {
    push({ key: `wc-${Math.round(pct(t.wc) / 5)}`, level: 'warn', icon: '🚽',
      title: 'Cassetta WC quasi piena', text: 'Prossima tappa: camper service.' });
  }

  /* --- energia --- */
  if (S.energy.soc <= 20) {
    push({ key: `soc-${Math.round(S.energy.soc / 5)}`, level: S.energy.soc <= 10 ? 'danger' : 'warn', icon: '🔋',
      title: `Batteria al ${Math.round(S.energy.soc)}%`, text: 'Riduci i carichi o cerca una colonnina.' });
  }

  /* --- dati vecchi --- */
  if (wx.stale() && !navigator.onLine) {
    push({ key: `offline-${bucket(Date.now(), 120)}`, icon: '📴', title: 'Sei offline',
      text: 'Sto mostrando l\'ultimo meteo scaricato. Radar e previsioni si aggiornano appena torna rete.' });
  }

  if (!cur) {
    push({ key: 'nodata', icon: '🛰️', title: 'Nessun dato meteo',
      text: 'Attiva la posizione e la connessione, poi tocca ⟳ in alto.' });
  }
  return out;
}

/** Ricalcola gli avvisi; restituisce quelli attivi (non scartati dall'utente). */
export function evaluate({ notify = true } = {}) {
  const all = build();
  const now = Date.now();
  // pulizia degli scarti vecchi
  for (const [k, ts] of Object.entries(A.dismissed)) if (now - ts > 24 * 3600 * 1000) delete A.dismissed[k];

  const active = all.filter((a) => !A.dismissed[a.key]);
  const before = new Set(A.active.map((a) => a.key));
  A.active = active;
  alerts.emit('update', active);

  if (notify) {
    for (const a of active) {
      if (before.has(a.key)) continue;
      if (a.notify && a.level !== 'info') pushNotification(a);
    }
  }
  store.set('dismissed', A.dismissed);
  return active;
}

export function dismiss(key) {
  A.dismissed[key] = Date.now();
  store.set('dismissed', A.dismissed);
  A.active = A.active.filter((a) => a.key !== key);
  alerts.emit('update', A.active);
}

export async function askNotifications() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const r = await Notification.requestPermission();
  return r === 'granted';
}

function pushNotification(a) {
  if (!S.settings.notify) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const opts = { body: a.text, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
      tag: a.key, vibrate: [80, 60, 80], lang: 'it' };
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(`${a.icon} ${a.title}`, opts));
    } else {
      new Notification(`${a.icon} ${a.title}`, opts);
    }
  } catch { /* alcune webview bloccano le notifiche */ }
}

export const levelRank = { danger: 0, warn: 1, info: 2 };
