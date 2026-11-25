// ============================================================
// Musique originale du Reel (v9.2, 24 nov. 2026) — version « deep house »
//
// Pourquoi : la musique du catalogue Instagram ne passe que par la porte Facebook, que Meta bloque depuis
// novembre ; trois dimanches de suite le Reel a été préparé puis refusé (« jamais de Reel muet »). Ici la
// musique est COMPOSÉE par le robot — synthèse pure, sans fichier ni dépendance — et intégrée dans le MP4 :
// le Reel n'est jamais muet, quelle que soit la porte. Instagram la signale comme son original d'@aeryndo.co.
//
// Brief de Valentyna (24 nov.) : « plus profonde et excitante », puis « moins électro, plus deep house ».
// La pièce (14 s, ré mineur, 122 bpm, grille calée pour qu'une mesure tombe pile sur le prix à 4,6 s) :
//   · intro (0 → 4,6 s) : nappe chaude et accords Rhodes en contretemps derrière un filtre qui s'ouvre
//     comme une intro de DJ, charleys discrets, pas de grosse caisse ;
//   · le prix (4,6 s) : la grosse caisse ronde entre, quatre temps par mesure, la basse profonde qui pompe
//     (side-chain), les accords prennent leur place ;
//   · quatre notes Rhodes brèves sur les détails (7,2 s) et l'appel (9,8 s), fondu sur la dernière seconde
//     (v4 : plus de basse, plus de lead tenu ni de vibrato, charleys adoucis — brief du 24 nov. ;
//      v5, 25 nov. : la pompe ne module plus que la basse — c'était le dernier « wwww » — et la basse monte encore).
// Accords Dm9 — Gm9 — Bbmaj9 — Am7 (i · iv · VI · v) : le dernier appelle le premier, la boucle tourne.
// Sortie : WAV 16 bits stéréo 44,1 kHz, déterministe (même fichier à chaque rendu).
// ============================================================
const fs = require("fs");

const SR = 44100;
const DUR = 14;
const N = SR * DUR;
const TAU = Math.PI * 2;
const BPM = 122, BEAT = 60 / BPM, BAR = 4 * BEAT;
const DROP = 4.6;                                   // le prix s'affiche : la grosse caisse entre
const T0 = DROP - 2 * BAR;                          // origine de la grille (≈ 0,67 s) : les mesures tombent sur le prix
const beatTime = b => T0 + b * BEAT;                // temps du temps n° b (b peut être fractionnaire)

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// accords par mesure à partir de T0 : Dm9, Gm9, Bbmaj9, Am7 (puis on reboucle) — voicings Rhodes serrés
const CHORDS = [
  { bass: 38, chord: [57, 60, 62, 64, 69] },   // Dm9   : A3 C4 D4 E4 A4  (basse D2)
  { bass: 43, chord: [58, 62, 65, 67, 69] },   // Gm9   : Bb3 D4 F4 G4 A4 (basse G2)
  { bass: 46, chord: [57, 60, 62, 65, 69] },   // Bbmaj9: A3 C4 D4 F4 A4  (basse Bb2)
  { bass: 45, chord: [57, 60, 64, 67, 72] }    // Am7   : A3 C4 E4 G4 C5  (basse A2)
];
const chordAt = t => { const bar = Math.floor((t - T0) / BAR); return CHORDS[((bar % 4) + 4) % 4]; };
const barStart = t => T0 + Math.floor((t - T0) / BAR) * BAR;

// --- utilitaires ---
function onePole(cut) { let y = 0; return (x, c) => { const k = 1 - Math.exp(-TAU * (c || cut) / SR); y += k * (x - y); return y; }; }
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
// ouverture du filtre : intro fermée qui s'ouvre jusqu'au prix, puis grand ouvert
const open = t => t < DROP ? 0.28 + 0.72 * smooth(t / DROP) * smooth(t / DROP) : 1;
let seed = 20261124;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };

// temps des grosses caisses (4 par mesure) à partir du prix
const KICKS = [];
for (let b = 0; beatTime(b) < DUR - 0.9; b++) if (beatTime(b) >= DROP - 1e-6) KICKS.push(beatTime(b));
// side-chain : creux à chaque grosse caisse (la pompe deep house)
function pump(t) {
  let g = 1;
  for (const k of KICKS) { const d = t - k; if (d >= 0 && d < 0.22) g = Math.min(g, 0.55 + 0.45 * smooth(d / 0.22)); }
  return g;
}

// --- couches ---
function renderKick(L, R) {
  // grosse caisse ronde : sinus 110 → 46 Hz, corps 0,25 s, attaque feutrée (pas de clic « électro »)
  for (const k of KICKS) {
    const i0 = Math.floor(k * SR), i1 = Math.min(N, i0 + Math.ceil(0.4 * SR));
    let ph = 0;
    for (let i = i0; i < i1; i++) {
      const tr = (i - i0) / SR;
      const f = 42 + 70 * Math.exp(-tr / 0.03);
      ph += TAU * f / SR;
      const a = Math.exp(-tr / 0.2) * Math.min(1, tr / 0.004);
      const s = Math.tanh(Math.sin(ph) * 1.3) * a * 0.86;
      L[i] += s; R[i] += s;
    }
  }
}

function renderHats(L, R) {
  // charleys : fermés sur les contretemps de croche (plus un léger « tic » sur les doubles), ouvert sur le « et » de 2 et 4
  const hp = onePole(6000), hp2 = onePole(6000);
  const tmp = new Float64Array(N);
  for (let s16 = 0; beatTime(s16 / 4) < DUR - 0.5; s16++) {
    const t = beatTime(s16 / 4); if (t < 0.3) continue;
    const pos = s16 % 4, beatInBar = Math.floor(s16 / 4) % 4;
    let vol = 0, dec = 0.03;
    if (pos === 2) { vol = 0.55; dec = 0.045; }                              // contretemps de croche : fermé
    if (pos === 2 && (beatInBar === 1 || beatInBar === 3)) { vol = 0.6; dec = 0.16; } // « et » de 2 et 4 : ouvert
    if (pos === 1 || pos === 3) { vol = 0.16; dec = 0.02; }                   // doubles : shaker discret
    if (!vol) continue;
    vol *= t < DROP ? 0.4 + 0.2 * smooth(t / DROP) : 0.55;
    const i0 = Math.floor(t * SR), i1 = Math.min(N, i0 + Math.ceil((dec * 4) * SR));
    for (let i = i0; i < i1; i++) { const tr = (i - i0) / SR; tmp[i] += rnd() * Math.exp(-tr / dec) * Math.min(1, tr / 0.001) * vol; }
  }
  const soft = onePole(9000), soft2 = onePole(9000);
  for (let i = 0; i < N; i++) {
    const x = tmp[i] - hp(tmp[i]);            // passe-haut 6 kHz : fin, sans sable dans les médiums
    const y = x - hp2(x);
    L[i] += soft(y) * 0.3; R[i] += soft2(y) * 0.27;   // et un voile au-dessus de 9 kHz : moins de fatigue
  }
}

function renderBass(L, R) {
  // basse profonde et ronde : sinus + un peu d'octave et de 3e harmonique, ligne syncopée (1 · et-de-2 · 3 · et-de-4)
  // sur la fondamentale et l'octave, side-chainée ; absente avant le prix (l'intro reste aérienne)
  const lp = onePole(320);
  const pattern = [[0, 0, 0.75], [1.5, 12, 0.4], [2, 0, 0.7], [3.5, 12, 0.45], [3, 7, 0.35]]; // [temps dans la mesure, intervalle, tenue]
  const notes = [];
  for (let bar = 0; T0 + bar * BAR < DUR; bar++) {
    const ch = CHORDS[bar % 4];
    for (const [off, iv, hold] of pattern) { const t = T0 + bar * BAR + off * BEAT; if (t >= DROP - 1e-6 && t < DUR - 0.8) notes.push({ t, f: midi(ch.bass + iv), hold: hold * BEAT, deep: off === 0 }); }
  }
  for (const n of notes) {
    const i0 = Math.floor(n.t * SR), i1 = Math.min(N, Math.ceil((n.t + n.hold + 0.12) * SR));
    for (let i = i0; i < i1; i++) {
      const tr = (i - i0) / SR;
      const e = Math.min(1, tr / 0.012) * (tr < n.hold ? 1 : Math.max(0, 1 - (tr - n.hold) / 0.12));
      const raw = Math.sin(TAU * n.f * tr) + 0.3 * Math.sin(TAU * 2 * n.f * tr) + 0.12 * Math.sin(TAU * 3 * n.f * tr) + (n.deep ? 0.35 * Math.sin(TAU * n.f / 2 * tr) : 0);
      const s = Math.tanh(raw * 1.3) * e * 0.78;
      L[i] += s; R[i] += s;
    }
  }
  for (let i = 0; i < N; i++) { const t = i / SR; const g = pump(t); L[i] = lp(L[i]) * g; R[i] = lp(R[i]) * g; }
}

function rhodes(f, tr, hold) {
  // timbre Rhodes : sinus + harmoniques 2 et 3 qui s'éteignent plus vite, léger trémolo, attaque 8 ms
  const a = Math.min(1, tr / 0.008);
  const d1 = Math.exp(-tr / (hold * 0.9)), d2 = Math.exp(-tr / (hold * 0.35)), d3 = Math.exp(-tr / (hold * 0.18));
  const trem = 1 - 0.03 * (0.5 - 0.5 * Math.cos(TAU * 4.5 * tr));
  return (Math.sin(TAU * f * tr) * d1 + 0.4 * Math.sin(TAU * 2 * f * tr + 0.4) * d2 + 0.18 * Math.sin(TAU * 3 * f * tr) * d3 + 0.08 * Math.sin(TAU * 4.01 * f * tr) * d3) * a * trem;
}

function renderStabs(L, R) {
  // accords Rhodes en contretemps : « et » de 1 et de 3 (longs), temps 4 (court) — le motif deep house
  const tmpL = new Float64Array(N), tmpR = new Float64Array(N);
  const hits = [[0.5, 0.9], [2.5, 0.9], [3.0, 0.45]];
  for (let bar = -1; T0 + bar * BAR < DUR; bar++) {
    const ch = CHORDS[((bar % 4) + 4) % 4];
    for (const [off, hold] of hits) {
      const t = T0 + bar * BAR + off * BEAT; if (t < 0.15 || t > DUR - 0.9) continue;
      const vol = t < DROP ? 0.8 + 0.15 * smooth(t / DROP) : 0.95;
      ch.chord.forEach((n, ni) => {
        const f = midi(n), pan = [-0.35, 0.25, -0.1, 0.35, 0.05][ni];
        const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
        const i0 = Math.floor(t * SR), i1 = Math.min(N, Math.ceil((t + hold * BEAT + 0.5) * SR));
        for (let i = i0; i < i1; i++) {
          const tr = (i - i0) / SR;
          const s = rhodes(f, tr, hold * BEAT) * vol * 0.11 * (tr < hold * BEAT ? 1 : Math.max(0, 1 - (tr - hold * BEAT) / 0.5));
          tmpL[i] += s * gl; tmpR[i] += s * gr;
        }
      });
    }
  }
  // chorus léger (deux lignes à retard modulé) + filtre qui s'ouvre + side-chain
  const dL = new Float64Array(N), dR = new Float64Array(N);
  const lpL = onePole(1200), lpR = onePole(1200);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const m1 = Math.round((0.012 + 0.0015 * Math.sin(TAU * 0.5 * t)) * SR), m2 = Math.round((0.017 + 0.0015 * Math.cos(TAU * 0.4 * t)) * SR);
    const cl = tmpL[i] * 0.8 + (i - m1 >= 0 ? tmpL[i - m1] : 0) * 0.5, cr = tmpR[i] * 0.8 + (i - m2 >= 0 ? tmpR[i - m2] : 0) * 0.5;
    const cut = 350 + 4500 * open(t);
    dL[i] = lpL(cl, cut); dR[i] = lpR(cr, cut);
  }
  for (let i = 0; i < N; i++) { L[i] += dL[i]; R[i] += dR[i]; }
}

function renderPad(L, R) {
  // nappe chaude et lente derrière les accords : triangle + saw douce désaccordées, filtre très fermé qui s'ouvre
  const tmpL = new Float64Array(N), tmpR = new Float64Array(N);
  for (let bar = -1; T0 + bar * BAR < DUR; bar++) {
    const ch = CHORDS[((bar % 4) + 4) % 4], t0 = Math.max(0, T0 + bar * BAR), t1 = Math.min(DUR, T0 + (bar + 1) * BAR);
    ch.chord.slice(0, 4).forEach((n, ni) => {
      const f0 = midi(n - 12), pan = [-0.4, 0.4, -0.15, 0.15][ni];
      const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
      const i0 = Math.floor(Math.max(0, t0 - 0.3) * SR), i1 = Math.min(N, Math.ceil((t1 + 0.6) * SR));
      for (let i = i0; i < i1; i++) {
        const t = i / SR;
        const e = smooth((t - (t0 - 0.3)) / 0.6) * (1 - smooth((t - t1) / 0.6));
        if (e <= 0) continue;
        let s = 0;
        for (const det of [-6, 6]) { const f = f0 * Math.pow(2, det / 1200), ph = (t * f + (ni + det) * 0.13) % 1; s += 0.6 * (4 * Math.abs(ph - 0.5) - 1) + 0.25 * (2 * ph - 1); }
        s *= e / 2; tmpL[i] += s * gl; tmpR[i] += s * gr;
      }
    });
  }
  const l1 = onePole(300), l2 = onePole(300), r1 = onePole(300), r2 = onePole(300);
  for (let i = 0; i < N; i++) {
    const t = i / SR, cut = 220 + 1900 * open(t), g = 0.24;
    L[i] += g * l2(l1(tmpL[i], cut), cut); R[i] += g * r2(r1(tmpR[i], cut), cut);
  }
}

function renderLead(L, R) {
  // lead doux et bref (sinus + vibrato, un peu de 2e harmonique), quelques notes seulement
  // (v4, brief du 24 nov. : « moins d'effet wwww vers la fin ») — sans vibrato, sans écho, notes brèves et feutrées
  const notes = [[7.25, 69, 0.35], [7.6, 72, 0.45], [9.85, 74, 0.35], [10.2, 69, 0.5]];
  const tmp = new Float64Array(N);
  for (const [at, n, hold] of notes) {
    const f = midi(n), i0 = Math.floor(at * SR), i1 = Math.min(N, Math.ceil((at + hold + 0.25) * SR));
    for (let i = i0; i < i1; i++) {
      const tr = (i - i0) / SR;
      const e = Math.min(1, tr / 0.02) * (tr < hold ? 1 : Math.max(0, 1 - (tr - hold) / 0.25));
      tmp[i] += rhodes(f, tr, hold + 0.25) * e * 0.1;
    }
  }
  const lp = onePole(1800);
  for (let i = 0; i < N; i++) { const s = lp(tmp[i]); L[i] += s * 0.9; R[i] += s * 1.1; }
}

function renderIntroSwell(L, R) {
  // dernier temps avant le prix : un souffle feutré qui monte (discret, pas de « riser » électro)
  const lp = onePole(800);
  const r0 = DROP - 1.2, r1 = DROP - 0.03;
  for (let i = Math.floor(r0 * SR); i < Math.floor(r1 * SR); i++) {
    const t = i / SR, x = (t - r0) / (r1 - r0);
    const s = lp(rnd(), 400 + 2600 * x) * (0.02 + 0.14 * x * x);
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
      for (const c of combs) { const o = c.buf[c.i]; c.s = o * 0.4 + c.s * 0.6; c.buf[c.i] = x[n] + c.s * 0.78; c.i = (c.i + 1) % c.d; acc += o; }
      acc *= 0.25;
      for (const a of aps) { const o = a.buf[a.i]; const v = acc + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; acc = o - v * 0.5; }
      y[n] = acc;
    }
    return y;
  }
  const hpL = onePole(300), hpR = onePole(300);
  const wl = chan(L.map(v => v - hpL(v)), 0), wr = chan(R.map(v => v - hpR(v)), 23);
  for (let i = 0; i < N; i++) { L[i] = L[i] * (1 - wet * 0.35) + wl[i] * wet; R[i] = R[i] * (1 - wet * 0.35) + wr[i] * wet; }
}

function master(L, R) {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let g = 1;
    if (t < 0.2) g = t / 0.2;
    if (t > DUR - 1.1) g = Math.max(0, (DUR - t) / 1.1);
    g = smooth(g); L[i] *= g; R[i] *= g;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const k = peak > 0 ? Math.pow(10, -0.8 / 20) / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= k; R[i] *= k; }
}

function compose() {
  const L = new Float64Array(N), R = new Float64Array(N);
  renderPad(L, R);
  renderStabs(L, R);
  renderLead(L, R);
  renderIntroSwell(L, R);
  reverb(L, R, 0.2);
  renderHats(L, R);
  renderBass(L, R);     // basse et grosse caisse après la réverbération : sèches et profondes
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
