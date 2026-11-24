// ============================================================
// Musique originale du Reel (v9.2, 24 nov. 2026)
//
// Pourquoi : la musique du catalogue Instagram ne passe que par la porte Facebook, que Meta bloque depuis
// novembre ; trois dimanches de suite le Reel a été préparé puis refusé (« jamais de Reel muet »). Ici la
// musique est COMPOSÉE par le robot — synthèse pure, sans fichier ni dépendance — et intégrée dans le MP4 :
// le Reel n'est jamais muet, quelle que soit la porte. Instagram la signale comme son original d'@aeryndo.co.
//
// La pièce (14 s, ré majeur, 80 bpm) : nappe chaude et lente (3 oscillateurs désaccordés, filtre qui s'ouvre),
// basse ronde, souffle de cabine très discret, et une mélodie clairsemée calée sur l'apparition des textes
// du Reel (0,6 s · 2,2 s · 4,6 s prix · 7,2 s · 9,8 s · 12,3 s). Accords D — Bm — G — A : le dernier appelle
// le premier, la boucle du Reel tourne sans accroc. Délai ping-pong et réverbération Schroeder.
// Sortie : WAV 16 bits stéréo 44,1 kHz, déterministe (même fichier à chaque rendu).
// ============================================================
const fs = require("fs");

const SR = 44100;
const DUR = 14;
const N = SR * DUR;
const TAU = Math.PI * 2;

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// notes MIDI : D2=38 … A4=69
const CHORDS = [
  // voicings sans la note de basse ni son octave : pas de battement entre nappe désaccordée et basse
  { at: 0.0, bass: 38, pad: [54, 57, 61, 64, 69] },   // Dmaj9  : F#3 A3 C#4 E4 A4
  { at: 3.5, bass: 35, pad: [50, 54, 57, 61, 66] },   // Bm9    : D3 F#3 A3 C#4 F#4
  { at: 7.0, bass: 31, pad: [47, 50, 54, 57, 62] },   // Gmaj9  : B2 D3 F#3 A3 D4
  { at: 10.5, bass: 33, pad: [47, 49, 52, 55, 57] }   // A9     : B2 C#3 E3 G3 A3
];
const CHORD_LEN = 3.5;
// mélodie : [temps, note MIDI, durée de résonance, volume]
const MELODY = [
  [0.6, 69, 2.2, 0.55],   // A4   — kicker
  [2.2, 78, 2.4, 0.6],    // F#5  — ville
  [4.6, 76, 1.6, 0.7],    // E5   — prix
  [5.2, 74, 2.6, 0.75],   // D5
  [7.2, 71, 2.4, 0.55],   // B4   — détails
  [9.8, 69, 1.6, 0.55],   // A4   — appel
  [10.4, 73, 2.6, 0.6],   // C#5
  [12.3, 74, 2.0, 0.65]   // D5   — fin
];

// --- générateurs ---
function env(t, a, d, s, r, len) {        // ADSR simple, t relatif à la note, len = durée tenue
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < len) return s;
  const x = (t - len) / r; return x >= 1 ? 0 : s * (1 - x) * (1 - x);
}
function onePole(cut) { let y = 0; return (x, c) => { const k = 1 - Math.exp(-TAU * (c || cut) / SR); y += k * (x - y); return y; }; }

function renderPad(L, R) {
  // chaque accord : 5 notes × 3 oscillateurs (saw doux + triangle), désaccordés de ±7 cents, panoramique par note
  const lpL = onePole(1100), lpR = onePole(1100);
  const tmpL = new Float64Array(N), tmpR = new Float64Array(N);
  CHORDS.forEach((ch, ci) => {
    ch.pad.forEach((n, ni) => {
      const f0 = midi(n);
      const pan = [-0.4, 0.4, -0.2, 0.2, 0][ni] || 0;         // réparti symétriquement
      const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
      const dets = [-7, 0, 7];
      const phases = dets.map((_, k) => (ci * 7 + ni * 3 + k) * 0.37 % 1);
      const start = ch.at, len = CHORD_LEN;
      const i0 = Math.max(0, Math.floor((start - 0.05) * SR)), i1 = Math.min(N, Math.ceil((start + len + 2.2) * SR));
      for (let i = i0; i < i1; i++) {
        const t = i / SR, tr = t - start;
        const e = env(tr, 1.4, 0.8, 0.85, 2.0, len);
        if (e <= 0) continue;
        let s = 0;
        for (let k = 0; k < 3; k++) {
          const f = f0 * Math.pow(2, dets[k] / 1200);
          const ph = (t * f + phases[k]) % 1;
          const saw = 2 * ph - 1;
          const tri = 4 * Math.abs(ph - 0.5) - 1;
          s += 0.55 * tri + 0.45 * saw * 0.6;
        }
        s *= e / 3;
        tmpL[i] += s * gl; tmpR[i] += s * gr;
      }
    });
  });
  // filtre passe-bas qui s'ouvre lentement (900 → 2200 Hz), deux étages
  const lp2L = onePole(1100), lp2R = onePole(1100);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const cut = 1100 + 1900 * (0.5 - 0.5 * Math.cos(TAU * t / 28)) + 300 * Math.sin(TAU * t * 0.13);
    L[i] += 0.30 * lp2L(lpL(tmpL[i], cut), cut);
    R[i] += 0.30 * lp2R(lpR(tmpR[i], cut), cut);
  }
}

function renderBass(L, R) {
  CHORDS.forEach(ch => {
    const f = midi(ch.bass), f2 = f * 2;
    const i0 = Math.floor(ch.at * SR), i1 = Math.min(N, Math.ceil((ch.at + CHORD_LEN + 1.2) * SR));
    for (let i = i0; i < i1; i++) {
      const t = i / SR, tr = t - ch.at;
      const e = env(tr, 0.35, 0.5, 0.8, 1.0, CHORD_LEN);
      if (e <= 0) continue;
      // fondamentale + octave (audible sur un haut-parleur de téléphone) + léger tremolo
      const trem = 1 - 0.08 * (0.5 - 0.5 * Math.cos(TAU * t * 1.333));
      const s = (0.7 * Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f2 * t)) * e * trem * 0.22;
      L[i] += s; R[i] += s;
    }
  });
}

function renderAir(L, R) {
  // souffle de cabine : bruit filtré très bas, ondulation lente, niveau -38 dB environ
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  const lL = onePole(450), lR = onePole(450), hL = onePole(80), hR = onePole(80);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const w = 0.012 * (0.75 + 0.25 * Math.sin(TAU * t / 9));
    const a = rnd(), b = rnd();
    const xl = lL(a) - hL(lL(a)), xr = lR(b) - hR(lR(b));
    L[i] += xl * w * 6; R[i] += xr * w * 6;
  }
}

function renderMelody(out) {
  // timbre « touche feutrée » : fondamentale + 2 harmoniques décroissant plus vite, attaque 12 ms
  MELODY.forEach(([at, n, hold, vol]) => {
    const f = midi(n);
    const i0 = Math.floor(at * SR), i1 = Math.min(N, Math.ceil((at + hold + 1.5) * SR));
    for (let i = i0; i < i1; i++) {
      const tr = i / SR - at;
      const att = Math.min(1, tr / 0.012);
      const d1 = Math.exp(-tr / (hold * 0.55)), d2 = Math.exp(-tr / (hold * 0.22)), d3 = Math.exp(-tr / (hold * 0.12));
      const s = (Math.sin(TAU * f * tr) * d1 + 0.35 * Math.sin(TAU * 2 * f * tr + 0.3) * d2 + 0.12 * Math.sin(TAU * 3 * f * tr) * d3) * att * vol * 0.34;
      out[i] += s;
    }
  });
}

function pingPong(mono, L, R) {
  // délai ping-pong 560 ms (croche pointée à 80 bpm), 3 retours décroissants, filtré
  const d = Math.round(0.56 * SR);
  const bufL = new Float64Array(N), bufR = new Float64Array(N);
  const lp = onePole(2600), lp2 = onePole(2600);
  for (let i = 0; i < N; i++) {
    const dry = mono[i];
    const fbL = i - d >= 0 ? bufR[i - d] : 0, fbR = i - d >= 0 ? bufL[i - d] : 0;
    bufL[i] = lp(dry * 0.5 + fbL * 0.42);
    bufR[i] = lp2(fbR * 0.42 + (i - Math.round(d / 2) >= 0 ? mono[i - Math.round(d / 2)] * 0.25 : 0));
    L[i] += dry * 0.72 + bufL[i] * 0.55;
    R[i] += dry * 0.72 + bufR[i] * 0.55;
  }
}

function reverb(L, R, wet) {
  // Schroeder : 4 peignes amortis + 2 passe-tout, délais légèrement différents à droite pour la largeur
  function chan(x, offs) {
    const combs = [1557, 1617, 1491, 1422].map(d => ({ d: d + offs, buf: new Float64Array(d + offs), i: 0, s: 0 }));
    const aps = [225, 556].map(d => ({ d, buf: new Float64Array(d), i: 0 }));
    const y = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      let acc = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.s = o * 0.3 + c.s * 0.7;                       // amortissement des aigus
        c.buf[c.i] = x[n] + c.s * 0.83;
        c.i = (c.i + 1) % c.d; acc += o;
      }
      acc *= 0.25;
      for (const a of aps) {
        const o = a.buf[a.i];
        const v = acc + o * 0.5;
        a.buf[a.i] = v; a.i = (a.i + 1) % a.d;
        acc = o - v * 0.5;
      }
      y[n] = acc;
    }
    return y;
  }
  const wl = chan(L, 0), wr = chan(R, 23);
  for (let i = 0; i < N; i++) { L[i] = L[i] * (1 - wet * 0.6) + wl[i] * wet; R[i] = R[i] * (1 - wet * 0.6) + wr[i] * wet; }
}

function master(L, R) {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let g = 1;
    if (t < 0.35) g = t / 0.35;                              // entrée douce
    if (t > DUR - 1.4) g = Math.max(0, (DUR - t) / 1.4);     // sortie en fondu
    g = g * g * (3 - 2 * g);                                 // courbe lisse
    L[i] *= g; R[i] *= g;
  }
  // écrêtage doux puis normalisation à -1 dBFS
  let peak = 0;
  for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.15); R[i] = Math.tanh(R[i] * 1.15); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const k = peak > 0 ? Math.pow(10, -1 / 20) / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; }
}

function compose() {
  const L = new Float64Array(N), R = new Float64Array(N);
  renderPad(L, R);
  renderBass(L, R);
  renderAir(L, R);
  const mel = new Float64Array(N); renderMelody(mel);
  pingPong(mel, L, R);
  reverb(L, R, 0.28);
  master(L, R);
  return { L, R };
}

function toWav({ L, R }) {
  const buf = Buffer.alloc(44 + N * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
  let o = 44;
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), o); o += 2;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), o); o += 2;
  }
  return buf;
}

// Écrit la pièce dans `file` (WAV) et renvoie le chemin.
function write(file) { fs.writeFileSync(file, toWav(compose())); return file; }

module.exports = { write, compose, DUR, SR, TITLE: "Aeryndo — Business au prix juste" };

if (require.main === module) {
  const out = process.argv[2] || "aeryndo-theme.wav";
  const t0 = Date.now(); write(out);
  console.log("écrit", out, "(" + DUR + " s) en " + (Date.now() - t0) + " ms");
}
