// ============================================================
// Musique originale du Reel (v9.2, 24 nov. 2026) — version « profonde »
//
// Pourquoi : la musique du catalogue Instagram ne passe que par la porte Facebook, que Meta bloque depuis
// novembre ; trois dimanches de suite le Reel a été préparé puis refusé (« jamais de Reel muet »). Ici la
// musique est COMPOSÉE par le robot — synthèse pure, sans fichier ni dépendance — et intégrée dans le MP4 :
// le Reel n'est jamais muet, quelle que soit la porte. Instagram la signale comme son original d'@aeryndo.co.
//
// La pièce (14 s, ré mineur, 100 bpm), brief de Valentyna du 24 nov. : « plus profonde et excitante ».
//   · une basse profonde qui pulse (sub + coup sourd à chaque temps, de plus en plus présent),
//   · une nappe sombre qui s'ouvre, un arpège filtré qui s'installe à l'arrivée de la ville (2,2 s),
//   · une montée (souffle + tension) qui mène au prix (4,6 s) : silence d'un dixième, puis IMPACT,
//   · un motif grave et net sur les détails (7,2 s) et l'appel (9,8 s), final tenu (12,3 s) en fondu.
// Accords Dm9 — Bbmaj7 — Gm9 — A7sus4 : le dernier appelle le premier, la boucle du Reel tourne sans accroc.
// Sortie : WAV 16 bits stéréo 44,1 kHz, déterministe (même fichier à chaque rendu).
// ============================================================
const fs = require("fs");

const SR = 44100;
const DUR = 14;
const N = SR * DUR;
const TAU = Math.PI * 2;
const BPM = 100, BEAT = 60 / BPM;
const HIT = 4.6;                       // l'instant du prix à l'écran

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// notes MIDI : D1=26, D2=38, D3=50, A3=57, D4=62
const CHORDS = [
  { at: 0.0, bass: 26, pad: [50, 53, 57, 60, 64], arp: [50, 53, 57, 60] },   // Dm9   : D3 F3 A3 C4 E4
  { at: 3.5, bass: 34, pad: [46, 50, 53, 57, 62], arp: [46, 50, 53, 57] },   // Bbmaj7: Bb2 D3 F3 A3 D4
  { at: 7.0, bass: 31, pad: [50, 53, 55, 58, 62], arp: [43, 50, 53, 58] },   // Gm9   : D3 F3 G3 Bb3 D4 (basse G1)
  { at: 10.5, bass: 33, pad: [52, 55, 57, 60, 64], arp: [45, 52, 55, 60] }   // A7sus4: E3 G3 A3 C4 E4
];
const CHORD_LEN = 3.5;
// motif grave et net (saw filtrée) : [temps, note, tenue, volume]
const MOTIF = [
  [HIT, 38, 1.4, 1.0],      // D2  — impact du prix
  [HIT + 0.6, 45, 0.9, 0.7],// A2
  [7.2, 46, 0.8, 0.75],     // Bb2 — détails
  [7.8, 43, 1.2, 0.7],      // G2
  [9.8, 45, 0.7, 0.8],      // A2  — appel
  [10.4, 48, 0.7, 0.7],     // C3
  [11.0, 50, 1.0, 0.8],     // D3
  [12.3, 38, 1.7, 1.0]      // D2  — final
];

// --- utilitaires ---
function env(t, a, d, s, r, len) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < len) return s;
  const x = (t - len) / r; return x >= 1 ? 0 : s * (1 - x) * (1 - x);
}
function onePole(cut) { let y = 0; return (x, c) => { const k = 1 - Math.exp(-TAU * (c || cut) / SR); y += k * (x - y); return y; }; }
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
// énergie globale : monte jusqu'au prix, reste haute, retombe à la toute fin
const energy = t => t < HIT ? 0.35 + 0.65 * smooth(t / HIT) : t > DUR - 1.6 ? 1 - 0.5 * smooth((t - (DUR - 1.6)) / 1.6) : 1;
// temps forts : un coup par temps à partir du prix, un sur deux avant (le cœur qui s'accélère)
function beats() {
  const out = [];
  for (let b = 0; b * BEAT < DUR; b++) { const t = b * BEAT; if (t < HIT - 0.3 && b % 2) continue; if (t >= HIT - 0.3 && t < HIT) continue; out.push(t); }
  if (!out.includes(HIT)) out.push(HIT);
  return out.sort((a, b) => a - b);
}
const BEATS = beats();
// side-chain : creux court à chaque coup, pour que la basse respire
function duck(t) {
  let g = 1;
  for (const b of BEATS) { const d = t - b; if (d >= 0 && d < 0.22) g = Math.min(g, 0.45 + 0.55 * smooth(d / 0.22)); }
  return g;
}
const chordAt = t => { let c = CHORDS[0]; for (const ch of CHORDS) if (t >= ch.at) c = ch; return c; };

// --- couches ---
function renderKick(L, R) {
  // coup sourd : sinus qui descend de 140 à 48 Hz, décroissance 0,32 s ; plus fort après le prix, très fort au prix
  for (const b of BEATS) {
    const vol = b === HIT ? 1.0 : b < HIT ? 0.45 + 0.3 * (b / HIT) : 0.8;
    const i0 = Math.floor(b * SR), i1 = Math.min(N, i0 + Math.ceil(0.45 * SR));
    let ph = 0;
    for (let i = i0; i < i1; i++) {
      const tr = (i - i0) / SR;
      const f = 48 + 92 * Math.exp(-tr / 0.045);
      ph += TAU * f / SR;
      const a = Math.exp(-tr / 0.32) * Math.min(1, tr / 0.002);
      const s = Math.tanh(Math.sin(ph) * 1.6) * a * vol * 0.6;
      L[i] += s; R[i] += s;
    }
  }
}

function renderSub(L, R) {
  // basse profonde tenue sur l'accord, sinus + octave (audible sur téléphone), écrêtage doux, pulsée par le side-chain
  const lp = onePole(180);
  for (let i = 0; i < N; i++) {
    const t = i / SR, ch = chordAt(t);
    const tr = t - ch.at;
    const e = env(tr, 0.08, 0.3, 0.9, 0.5, CHORD_LEN);
    const f = midi(ch.bass);
    const raw = 0.8 * Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2 * t) + 0.12 * Math.sin(TAU * f * 3 * t);
    const s = lp(Math.tanh(raw * 1.4)) * e * energy(t) * duck(t) * 0.42;
    L[i] += s; R[i] += s;
  }
}

function renderPad(L, R) {
  // nappe sombre : 5 notes × 3 oscillateurs désaccordés (saw + triangle), passe-bas qui s'ouvre avec l'énergie
  const tmpL = new Float64Array(N), tmpR = new Float64Array(N);
  CHORDS.forEach((ch, ci) => {
    ch.pad.forEach((n, ni) => {
      const f0 = midi(n), pan = [-0.45, 0.45, -0.2, 0.2, 0][ni] || 0;
      const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
      const dets = [-9, 0, 9], phases = dets.map((_, k) => (ci * 7 + ni * 3 + k) * 0.37 % 1);
      const i0 = Math.max(0, Math.floor((ch.at - 0.05) * SR)), i1 = Math.min(N, Math.ceil((ch.at + CHORD_LEN + 1.6) * SR));
      for (let i = i0; i < i1; i++) {
        const t = i / SR, e = env(t - ch.at, 0.9, 0.6, 0.85, 1.5, CHORD_LEN);
        if (e <= 0) continue;
        let s = 0;
        for (let k = 0; k < 3; k++) {
          const f = f0 * Math.pow(2, dets[k] / 1200), ph = (t * f + phases[k]) % 1;
          s += 0.5 * (4 * Math.abs(ph - 0.5) - 1) + 0.5 * (2 * ph - 1) * 0.6;
        }
        s *= e / 3; tmpL[i] += s * gl; tmpR[i] += s * gr;
      }
    });
  });
  const l1 = onePole(600), l2 = onePole(600), r1 = onePole(600), r2 = onePole(600);
  for (let i = 0; i < N; i++) {
    const t = i / SR, cut = 500 + 2600 * energy(t) * (0.6 + 0.4 * (0.5 - 0.5 * Math.cos(TAU * t / 9)));
    const g = 0.30 * (0.7 + 0.3 * duck(t));
    L[i] += g * l2(l1(tmpL[i], cut), cut); R[i] += g * r2(r1(tmpR[i], cut), cut);
  }
}

function renderArp(L, R) {
  // arpège en doubles-croches, timbre court et filtré, qui apparaît à l'arrivée de la ville et s'installe au prix
  const step = BEAT / 4;
  const lpL = onePole(1200), lpR = onePole(1200);
  const tmp = new Float64Array(N);
  for (let k = 0; k * step < DUR; k++) {
    const t0 = k * step; if (t0 < 2.2) continue;
    const ch = chordAt(t0), seq = ch.arp.concat(ch.arp.slice(1, 3).reverse());
    const n = seq[k % seq.length] + (k % 8 === 7 ? 12 : 0);
    const f = midi(n);
    const vol = (t0 < HIT ? 0.35 + 0.4 * smooth((t0 - 2.2) / (HIT - 2.2)) : 0.8) * energy(t0);
    const i0 = Math.floor(t0 * SR), i1 = Math.min(N, i0 + Math.ceil(0.22 * SR));
    for (let i = i0; i < i1; i++) {
      const tr = (i - i0) / SR, a = Math.min(1, tr / 0.004) * Math.exp(-tr / 0.07);
      const ph = (tr * f) % 1;
      tmp[i] += ((2 * ph - 1) * 0.6 + Math.sin(TAU * f * tr) * 0.4) * a * vol * 0.26;
    }
  }
  const d = Math.round(0.45 * SR);  // écho croche pointée, ping-pong
  const eL = new Float64Array(N), eR = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR, cut = 900 + 2800 * energy(t);
    const dry = tmp[i] * duck(t);
    eL[i] = dry * 0.7 + (i - d >= 0 ? eR[i - d] * 0.38 : 0);
    eR[i] = dry * 0.7 + (i - d >= 0 ? eL[i - d] * 0.38 : 0) + (i - Math.round(d / 2) >= 0 ? tmp[i - Math.round(d / 2)] * 0.2 : 0);
    L[i] += lpL(eL[i], cut) * 0.9; R[i] += lpR(eR[i], cut) * 0.9;
  }
}

function renderMotif(L, R) {
  // motif grave : saw filtrée + sous-octave, attaque nette, pour les moments clés
  const lp = onePole(900);
  for (const [at, n, hold, vol] of MOTIF) {
    const f = midi(n);
    const i0 = Math.floor(at * SR), i1 = Math.min(N, Math.ceil((at + hold + 0.6) * SR));
    for (let i = i0; i < i1; i++) {
      const tr = i / SR - at;
      const e = env(tr, 0.01, 0.25, 0.7, 0.5, hold);
      if (e <= 0) continue;
      const ph = (tr * f) % 1, ph2 = (tr * f / 2) % 1;
      const raw = (2 * ph - 1) * 0.7 + (2 * ph2 - 1) * 0.3;
      const cut = 500 + 1800 * Math.exp(-tr / 0.35);
      const s = lp(raw, cut) * e * vol * 0.34;
      L[i] += s * 0.95; R[i] += s * 1.05;
    }
  }
}

function renderRiser(L, R) {
  // souffle qui monte vers le prix (3,2 s → 4,5 s), puis souffle d'impact au prix ; silence d'un dixième juste avant
  let seed = 987654321;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  const bp = onePole(800), hp = onePole(300);
  const r0 = 3.2, r1 = HIT - 0.1;
  for (let i = Math.floor(r0 * SR); i < Math.floor(r1 * SR); i++) {
    const t = i / SR, x = (t - r0) / (r1 - r0);
    const cut = 500 + 4500 * x * x;
    const n = rnd();
    const s = (bp(n, cut) - hp(bp(n, cut), 200)) * (0.04 + 0.30 * x * x * x);
    L[i] += s * (1 - 0.3 * x); R[i] += s * (0.7 + 0.3 * x);
  }
  // crash feutré à l'impact : bruit filtré, décroissance 1,1 s
  const c1 = onePole(4000);
  for (let i = Math.floor(HIT * SR); i < Math.min(N, Math.floor((HIT + 1.3) * SR)); i++) {
    const tr = i / SR - HIT, a = Math.exp(-tr / 0.38) * 0.22;
    const s = c1(rnd(), 3500 - 2500 * Math.min(1, tr)) * a;
    L[i] += s; R[i] += s;
  }
}

function reverb(L, R, wet) {
  function chan(x, offs) {
    const combs = [1557, 1617, 1491, 1422].map(d => ({ d: d + offs, buf: new Float64Array(d + offs), i: 0, s: 0 }));
    const aps = [225, 556].map(d => ({ d, buf: new Float64Array(d), i: 0 }));
    const y = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      let acc = 0;
      for (const c of combs) { const o = c.buf[c.i]; c.s = o * 0.35 + c.s * 0.65; c.buf[c.i] = x[n] + c.s * 0.8; c.i = (c.i + 1) % c.d; acc += o; }
      acc *= 0.25;
      for (const a of aps) { const o = a.buf[a.i]; const v = acc + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; acc = o - v * 0.5; }
      y[n] = acc;
    }
    return y;
  }
  const hpL = onePole(250), hpR = onePole(250);     // la réverbération ne touche pas le grave : il reste net
  const wl = chan(L.map((v, i) => v - hpL(v)), 0), wr = chan(R.map((v, i) => v - hpR(v)), 23);
  for (let i = 0; i < N; i++) { L[i] = L[i] * (1 - wet * 0.4) + wl[i] * wet; R[i] = R[i] * (1 - wet * 0.4) + wr[i] * wet; }
}

function master(L, R) {
  const gap0 = Math.floor((HIT - 0.1) * SR), gap1 = Math.floor(HIT * SR);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let g = 1;
    if (t < 0.25) g = t / 0.25;
    if (t > DUR - 1.2) g = Math.max(0, (DUR - t) / 1.2);
    if (i >= gap0 && i < gap1) g *= 1 - smooth((i - gap0) / (gap1 - gap0)) * 0.97;   // le silence avant l'impact
    g = smooth(g);
    L[i] *= g; R[i] *= g;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.05); R[i] = Math.tanh(R[i] * 1.05); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const k = peak > 0 ? Math.pow(10, -0.8 / 20) / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; }
}

function compose() {
  const L = new Float64Array(N), R = new Float64Array(N);
  renderPad(L, R);
  renderArp(L, R);
  renderMotif(L, R);
  renderRiser(L, R);
  reverb(L, R, 0.22);
  renderSub(L, R);      // la basse et le coup sourd après la réverbération : secs, profonds
  renderKick(L, R);
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
