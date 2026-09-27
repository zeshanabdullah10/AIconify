// Synthesizes the film's score and sound design, in time with src/timeline.json, and writes
// public/music.wav. No samples: every sound is made here, so the film has no licensing strings.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const T = JSON.parse(readFileSync(new URL('../src/timeline.json', import.meta.url)));
const SR = 44100;
const seconds = T.total / T.fps + 0.5;
const N = Math.ceil(seconds * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const send = new Float32Array(N); // reverb bus (mono in)
const beat = 60 / T.bpm;
const at = (frame) => frame / T.fps;
const scene = (id) => T.scenes.find((s) => s.id === id);
const sceneStart = (id) => at(scene(id).from);
const sceneEnd = (id) => at(scene(id).from + scene(id).duration);
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function add(t0, dur, fn, { gain = 1, pan = 0, rev = 0 } = {}) {
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.floor((t0 + dur) * SR));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR, i / SR);
    L[i] += v * gl;
    R[i] += v * gr;
    if (rev) send[i] += v * gain * rev;
  }
}

const env = (t, a, d) => (t < a ? t / a : Math.max(0, 1 - (t - a) / d));

/* ---------- chords ---------- */
// Am9 · Fmaj7 · C(add9) · G6, two bars each: calm, modern, a little hopeful.
const CHORDS = [
  [45, 57, 60, 64, 67, 71],
  [41, 57, 60, 64, 65, 69],
  [48, 55, 60, 62, 64, 67],
  [43, 55, 59, 62, 64, 67],
];
const barLen = beat * 4;
const chordLen = barLen * 2;
const end = sceneEnd('outro');
const outro = sceneStart('outro');

// Pad: detuned saws (a few harmonics each), slow swell, brightness rising through the film.
for (let t0 = 0, k = 0; t0 < end; t0 += chordLen, k++) {
  const chord = CHORDS[k % CHORDS.length];
  const last = t0 + chordLen >= outro;
  const dur = last ? end - t0 : chordLen + 0.6;
  for (const [v, note] of chord.slice(1).entries()) {
    for (const det of [-0.08, 0.08]) {
      const f = midi(note + det);
      let lp = 0;
      add(
        t0,
        dur,
        (t, abs) => {
          const bright = 0.04 + 0.1 * Math.min(1, abs / outro);
          let saw = 0;
          for (let h = 1; h <= 5; h++) saw += Math.sin(2 * Math.PI * f * h * t + v) / h;
          lp += bright * (saw - lp);
          const a = Math.min(1, t / 1.2) * Math.min(1, (dur - t) / 0.9);
          return lp * a * 0.05;
        },
        { pan: (v - 2) * 0.25 * (det > 0 ? 1 : -1), rev: 0.6 },
      );
    }
  }
  // Bass: root on every beat once the brand scene starts, a long note in the intro and outro.
  const root = midi(chord[0] - 12 + 12);
  const pulses = t0 >= sceneStart('brand') - 0.01 && t0 < outro;
  if (pulses) {
    for (let b = 0; b < 8; b++) add(t0 + b * beat, beat * 0.9, (t) => Math.sin(2 * Math.PI * root * t) * env(t, 0.01, beat * 0.85) * 0.22, { gain: 1 });
  } else {
    add(t0, dur, (t) => Math.sin(2 * Math.PI * root * t) * Math.min(1, t / 0.5) * Math.min(1, (dur - t) / 1.2) * 0.14);
  }
}

/* ---------- drums ---------- */
const kickFrom = sceneStart('sheet');
for (let t0 = kickFrom; t0 < outro - 0.01; t0 += beat) {
  add(t0, 0.35, (t) => {
    const f = 45 + 80 * Math.exp(-t * 28);
    return Math.sin(2 * Math.PI * f * t + 4 * (1 - Math.exp(-t * 28)) / 28) * Math.exp(-t * 9) * 0.5;
  });
}
// Hats on the off-beats in the busiest scenes.
for (const id of ['labview', 'export']) {
  for (let t0 = sceneStart(id) + beat / 2; t0 < sceneEnd(id) - 0.1; t0 += beat) {
    let hp = 0;
    let prev = 0;
    add(t0, 0.05, (t) => {
      const n = rand();
      hp = 0.92 * (hp + n - prev);
      prev = n;
      return hp * Math.exp(-t * 90) * 0.12;
    }, { pan: 0.3 });
  }
}

/* ---------- arpeggio in the LabVIEW scene ---------- */
{
  const s0 = sceneStart('labview');
  const s1 = sceneEnd('labview') - 0.2;
  for (let t0 = s0, i = 0; t0 < s1; t0 += beat / 4, i++) {
    const k = Math.floor(t0 / chordLen) % CHORDS.length;
    const tones = CHORDS[k].slice(1);
    const f = midi(tones[[0, 2, 1, 3, 2, 4, 1, 3][i % 8]] + 12);
    const fadeIn = Math.min(1, (t0 - s0) / 2);
    add(t0, 0.3, (t) => (Math.abs(((t * f) % 1) * 4 - 2) - 1) * Math.exp(-t * 14) * 0.05 * fadeIn, { pan: i % 2 ? 0.4 : -0.4, rev: 0.35 });
  }
}

/* ---------- sound design ---------- */
// Whoosh into every cut: filtered noise that swells and opens.
for (const s of T.scenes.slice(1)) {
  const t0 = at(s.from) - 0.55;
  let lp = 0;
  add(t0, 0.75, (t) => {
    const x = t / 0.75;
    lp += (0.02 + 0.3 * x * x) * (rand() - lp);
    return lp * Math.sin(Math.PI * Math.min(1, x * 1.15)) * 0.35;
  }, { pan: 0, rev: 0.3 });
}
// Button clicks, in time with the cursor.
for (const c of T.clicks) {
  add(at(c) - 0.01, 0.06, (t) => (Math.sin(2 * Math.PI * 2400 * t) * 0.5 + rand() * 0.5) * Math.exp(-t * 120) * 0.35, { pan: 0.15 });
  add(at(c) + 0.08, 0.12, (t) => Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 40) * 0.08, { rev: 0.4 });
}
// HMI state changes and the alarm.
for (const b of T.blips) add(at(b), 0.16, (t) => Math.sin(2 * Math.PI * 1040 * t) * Math.exp(-t * 30) * 0.12, { rev: 0.5 });
for (const a of T.alarms) {
  for (let r = 0; r < 3; r++) {
    add(at(a) + r * 0.32, 0.14, (t) => Math.sin(2 * Math.PI * 880 * t) * env(t, 0.005, 0.13) * 0.1, { rev: 0.4 });
    add(at(a) + r * 0.32 + 0.14, 0.14, (t) => Math.sin(2 * Math.PI * 660 * t) * env(t, 0.005, 0.13) * 0.1, { rev: 0.4 });
  }
}
// The logo lands: a soft low hit and a bright chime.
{
  const t0 = sceneStart('outro') + at(40);
  add(t0, 2.5, (t) => Math.sin(2 * Math.PI * (55 + 30 * Math.exp(-t * 10)) * t) * Math.exp(-t * 2.2) * 0.45);
  for (const [n, g] of [[76, 0.06], [83, 0.04], [88, 0.03]]) add(t0, 3, (t) => Math.sin(2 * Math.PI * midi(n) * t) * Math.exp(-t * 1.6) * g, { rev: 0.8 });
}

/* ---------- reverb: four combs and two all-passes ---------- */
{
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0, lp: 0 }));
  const aps = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = send[n] * 0.35;
    let y = 0;
    for (const c of combs) {
      const out = c.buf[c.i];
      c.lp = out * 0.6 + c.lp * 0.4;
      c.buf[c.i] = x + c.lp * 0.84;
      c.i = (c.i + 1) % c.d;
      y += out;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      const o = -y + b;
      a.buf[a.i] = y + b * 0.5;
      a.i = (a.i + 1) % a.d;
      y = o;
    }
    L[n] += y * 0.5;
    R[n] += (n > 300 ? y : 0) * 0.5;
  }
}

/* ---------- master: gentle fades, soft clip, normalise ---------- */
let peak = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fade = Math.min(1, t / 0.3) * Math.min(1, Math.max(0, (seconds - 0.5 - t) / 2.2));
  L[n] = Math.tanh(L[n] * 1.2) * fade;
  R[n] = Math.tanh(R[n] * 1.2) * fade;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const norm = 0.89 / peak;
const data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0);
data.writeUInt32LE(36 + N * 4, 4);
data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[n] * norm)) * 32767), 44 + n * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[n] * norm)) * 32767), 46 + n * 4);
}
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/music.wav', import.meta.url), data);
console.log(`music.wav: ${seconds.toFixed(1)} s, peak normalised from ${peak.toFixed(2)}`);
