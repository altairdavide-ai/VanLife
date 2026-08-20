/* Sensori di assetto: inclinazione (livella) e bussola.
   Il tablet va appoggiato su un piano del van (cruscotto, tavolo): con "azzera"
   si compensa l'inclinazione del supporto e si misura solo il van. */

import { Emitter, store } from './util.js';

export const tilt = new Emitter();

export const T = {
  supported: 'DeviceOrientationEvent' in window,
  running: false,
  raw: { beta: 0, gamma: 0, alpha: null },
  offset: store.get('tiltOffset', { beta: 0, gamma: 0 }),
  heading: null,
  headingAbsolute: false,
};

tilt.state = { pitch: 0, roll: 0, supported: T.supported, heading: null };

let listening = false;

function onOrient(e) {
  if (e.beta === null && e.gamma === null && e.alpha === null) return;
  T.raw = { beta: e.beta ?? 0, gamma: e.gamma ?? 0, alpha: e.alpha };

  // Compensiamo la rotazione dello schermo: la livella deve restare coerente
  // che il tablet sia in orizzontale o in verticale.
  const angle = (screen.orientation?.angle ?? window.orientation ?? 0);
  let pitch = T.raw.beta, roll = T.raw.gamma;
  if (angle === 90) { pitch = T.raw.gamma; roll = -T.raw.beta; }
  else if (angle === 270 || angle === -90) { pitch = -T.raw.gamma; roll = T.raw.beta; }
  else if (angle === 180) { pitch = -T.raw.beta; roll = -T.raw.gamma; }

  tilt.state.pitch = pitch - T.offset.beta;
  tilt.state.roll = roll - T.offset.gamma;
  tilt.state.supported = true;

  if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
    T.heading = e.webkitCompassHeading;
    T.headingAbsolute = true;
  } else if (T.raw.alpha !== null) {
    T.heading = (360 - T.raw.alpha + angle) % 360;
    T.headingAbsolute = !!e.absolute;
  }
  tilt.state.heading = T.heading;
  tilt.emit('tilt', tilt.state);
}

export async function requestPermission() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {   // iPadOS
    try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
  }
  return true;
}

export async function start() {
  if (listening || !T.supported) return T.supported;
  if (!(await requestPermission())) return false;
  window.addEventListener('deviceorientationabsolute', onOrient, true);
  window.addEventListener('deviceorientation', onOrient, true);
  listening = true; T.running = true;
  return true;
}

export function stop() {
  if (!listening) return;
  window.removeEventListener('deviceorientationabsolute', onOrient, true);
  window.removeEventListener('deviceorientation', onOrient, true);
  listening = false; T.running = false;
}

/** Azzera sul piano attuale (il tablet diventa "lo zero"). */
export function calibrate() {
  const angle = (screen.orientation?.angle ?? 0);
  let pitch = T.raw.beta, roll = T.raw.gamma;
  if (angle === 90) { pitch = T.raw.gamma; roll = -T.raw.beta; }
  else if (angle === 270 || angle === -90) { pitch = -T.raw.gamma; roll = T.raw.beta; }
  else if (angle === 180) { pitch = -T.raw.beta; roll = -T.raw.gamma; }
  T.offset = { beta: pitch + T.offset.beta, gamma: roll + T.offset.gamma };
  store.set('tiltOffset', T.offset);
  tilt.state.pitch = 0; tilt.state.roll = 0;
  tilt.emit('tilt', tilt.state);
}

export function resetCalibration() {
  T.offset = { beta: 0, gamma: 0 };
  store.set('tiltOffset', T.offset);
}

/** Traduce i gradi in centimetri di zeppa sotto le ruote. */
export function wedgeAdvice(pitch, roll, wheelbaseCm, trackCm, tolDeg) {
  const rad = Math.PI / 180;
  const dLong = Math.tan(pitch * rad) * wheelbaseCm;   // >0: muso in su
  const dLat = Math.tan(roll * rad) * trackCm;         // >0: lato destro in su
  const out = [];
  if (Math.abs(pitch) > tolDeg) {
    out.push(pitch > 0
      ? { text: `Alza le ruote posteriori di ${Math.abs(dLong).toFixed(0)} cm`, cm: Math.abs(dLong), side: 'retro' }
      : { text: `Alza le ruote anteriori di ${Math.abs(dLong).toFixed(0)} cm`, cm: Math.abs(dLong), side: 'fronte' });
  }
  if (Math.abs(roll) > tolDeg) {
    out.push(roll > 0
      ? { text: `Alza le ruote di sinistra di ${Math.abs(dLat).toFixed(0)} cm`, cm: Math.abs(dLat), side: 'sinistra' }
      : { text: `Alza le ruote di destra di ${Math.abs(dLat).toFixed(0)} cm`, cm: Math.abs(dLat), side: 'destra' });
  }
  return out;
}
