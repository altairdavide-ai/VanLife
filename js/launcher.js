/* Ponte verso le app native di Android.
   Chrome capisce gli URL "intent://": se l'app è installata la apre, altrimenti
   segue l'indirizzo di ripiego (il sito o la scheda sul Play Store). */

import { toast, buzz } from './util.js';

export const isAndroid = () => /android/i.test(navigator.userAgent);

export function intentUrl(pkg, fallback) {
  const fb = fallback || (pkg ? `https://play.google.com/store/apps/details?id=${pkg}` : '');
  return `intent://launch/#Intent;package=${pkg};S.browser_fallback_url=${encodeURIComponent(fb)};end`;
}

/** Apre un'app di bordo. app = {name, pkg, url} */
export function launchApp(app) {
  buzz();
  if (!app) return;
  const url = (app.url || '').trim();
  if (app.pkg && isAndroid()) {
    window.location.href = intentUrl(app.pkg, url);
    setTimeout(() => { /* se non succede nulla, l'app non c'è: ci pensa il fallback */ }, 800);
    return;
  }
  if (url) { window.open(url, '_blank', 'noopener'); return; }
  if (app.pkg) { window.open(`https://play.google.com/store/apps/details?id=${app.pkg}`, '_blank', 'noopener'); return; }
  toast(`${app.name}: manca il pacchetto o l'indirizzo`);
}

/** Avvia la navigazione verso delle coordinate con l'app di mappe del telefono. */
export function navigateTo(lat, lon, label = '') {
  buzz();
  const q = `${lat},${lon}`;
  if (isAndroid()) {
    window.location.href = `geo:${q}?q=${q}${label ? '(' + encodeURIComponent(label) + ')' : ''}`;
    return;
  }
  window.open(`https://www.google.com/maps?q=${q}`, '_blank', 'noopener');
}

/** Condivide posizione o testo con le app installate (WhatsApp, Telegram...). */
export async function share(title, text, url) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return true; }
    await navigator.clipboard.writeText(`${text}${url ? ' ' + url : ''}`);
    toast('Copiato negli appunti');
    return true;
  } catch { return false; }
}
