// ============================================================
// AERYNDO — la charte de chasse, en code
//
// Un tarif Business est un DEAL s'il coche au moins un seuil :
//   - moins de SEUIL_PAR_KM euros par kilomètre (long-courrier), ou
//   - au moins DECOTE_MIN sous la médiane des tarifs de sa route ;
// et s'il respecte les garde-fous :
//   - aller-retour ; une seule date suffit : la preuve, c'est la vérification
//     en direct (Google Flights) du prix, pas la largeur du cache (choix du 8 oct. 2026),
//   - lit à plat sur le long-courrier (jugé après vérification en direct,
//     à partir de l'appareil et de la compagnie).
// ============================================================

const SEUIL_PAR_KM = 0.22;   // €/km
const DECOTE_MIN = 0.30;     // 30 % sous la médiane de la route
const LONG_HAUL_KM = 3500;   // au-delà : lit à plat exigé
const MIN_DATES = 1;         // dates à +10 % du meilleur prix exigées avant vérification (était 3 ; le nombre reste affiché)
const MIN_SAMPLES = 10;      // échantillons pour qu'une médiane vaille quelque chose

// ---------- panier mondial ----------
// Origines : hubs où naissent les tarifs erreur et les promotions ; destinations :
// les grandes routes business. Le balayage tourne en round-robin (voir scan.js).
const ORIGINS = [
  "PAR", "NCE", "LYS", "LON", "MAN", "DUB", "AMS", "BRU", "LUX", "FRA", "MUC", "BER", "DUS", "ZRH", "GVA", "VIE",
  "MIL", "ROM", "MAD", "BCN", "LIS", "CPH", "STO", "OSL", "HEL", "WAW", "PRG", "BUD", "ATH", "IST",
  "NYC", "BOS", "WAS", "CHI", "MIA", "LAX", "SFO", "YTO", "YUL", "MEX", "SAO", "RIO", "BUE",
  "DXB", "DOH", "AUH", "CAI", "JNB", "CPT", "NBO", "ADD",
  "DEL", "BOM", "BKK", "SIN", "KUL", "HKG", "TYO", "SEL", "SHA", "BJS", "SYD", "MEL"
];
const DESTINATIONS = [
  "NYC", "LAX", "SFO", "MIA", "CHI", "BOS", "YTO", "MEX", "SAO", "RIO", "BUE", "LIM", "BOG",
  "LON", "PAR", "ROM", "MIL", "MAD", "LIS", "ATH", "IST",
  "DXB", "DOH", "AUH", "MCT", "CAI", "TLV", "RUH", "JED",
  "JNB", "CPT", "NBO", "MRU", "SEZ", "ADD", "DSS", "CMN",
  "DEL", "BOM", "MLE", "CMB", "BKK", "HKT", "SIN", "KUL", "DPS", "CGK", "MNL", "SGN", "HAN",
  "HKG", "TPE", "TYO", "OSA", "SEL", "SHA", "BJS", "CAN", "SYD", "MEL", "AKL"
];

// Toutes les paires origine→destination, sans doublon ni A→A. Ordre stable
// pour que le curseur du round-robin ait un sens d'une exécution à l'autre.
function basket() {
  const out = [];
  for (const o of ORIGINS) for (const d of DESTINATIONS) if (o !== d) out.push([o, d]);
  return out;
}

// ---------- siège : à plat ou pas ----------
// Appareils long-courrier où la Business est à plat chez la quasi-totalité des
// compagnies en 2026. Les autres codes sont jugés « inclinable » sauf exception.
const FLAT_AIRCRAFT = new Set([
  "77W", "77L", "773", "772", "779", "788", "789", "781", "787",
  "351", "359", "350", "388", "380", "338", "339", "332", "333", "343", "346", "330",
  "744", "748", "747", "764", "763", "777"
]);
// Monocouloirs où certaines compagnies installent un vrai lit.
const FLAT_NARROWBODY = {
  "32Q": ["B0", "AZ", "EI", "TP", "SK", "B6", "JL", "TS", "TK", "AC"],
  "32N": ["B0", "AZ", "EI", "TP", "SK", "B6", "JL", "AC"],
  "321": ["B0", "B6", "EI", "TP", "AZ", "SK", "AC"],
  "32B": ["B0", "B6", "AZ"],
  "32A": ["B0"]
};
const ALL_BUSINESS_CARRIERS = new Set(["B0", "B4"]); // La Compagnie (B0), Beond (B4) : cabine 100 % Business à plat

function segmentSeat(aircraft, carrier) {
  const a = String(aircraft || "").toUpperCase(), c = String(carrier || "").toUpperCase();
  if (ALL_BUSINESS_CARRIERS.has(c)) return "flat";
  if (FLAT_AIRCRAFT.has(a)) return "flat";
  if (FLAT_NARROWBODY[a] && FLAT_NARROWBODY[a].includes(c)) return "flat";
  if (!a) return "unknown";
  return "recliner";
}

// Verdict sur un itinéraire : le tronçon le plus long fait foi.
// flat = à plat partout où ça compte ; partial = à plat sur le long-courrier,
// classique sur un tronçon court ; recliner = pas de lit sur le long-courrier.
function itinerarySeat(segments) {
  if (!segments || !segments.length) return { kind: "unknown", leg: "", aircraft: "", detail: "" };
  const withMin = segments.map(s => Object.assign({}, s, { minutes: isoMinutes(s.duration) }));
  const longest = withMin.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const leg = `${longest.from} → ${longest.to}`;
  const aircraft = String(longest.aircraft || "").toUpperCase();
  const longSeat = segmentSeat(aircraft, longest.carrier);
  const others = withMin.filter(s => s !== longest).map(s => segmentSeat(s.aircraft, s.carrier));
  const base = { leg, aircraft, carrier: longest.carrier || null };
  if (longSeat === "recliner") return Object.assign(base, { kind: "recliner", detail: `${leg} en ${aircraft || "appareil inconnu"} : siège inclinable, pas un lit.` });
  if (longSeat === "unknown") return Object.assign(base, { kind: "unknown", detail: "Appareil non communiqué par le vendeur." });
  if (others.some(s => s !== "flat")) return Object.assign(base, { kind: "partial", detail: `Lit à plat sur ${leg} (${aircraft}) ; siège classique sur le tronçon court.` });
  return Object.assign(base, { kind: "flat", detail: `Lit à plat sur ${leg} (${aircraft})${segments.length > 1 ? " et sur les correspondances" : ""}.` });
}

function isoMinutes(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(String(iso || ""));
  return m ? (Number(m[1] || 0) * 60 + Number(m[2] || 0)) : 0;
}

// ---------- scoring ----------
// offers : tarifs du cache TP pour la route ; retourne le candidat ou null.
function evaluate(route, offers) {
  const rt = (offers || []).filter(o => o.ret && o.price > 0);
  if (rt.length < MIN_DATES) return null;
  const prices = rt.map(o => o.price);
  const min = Math.min.apply(null, prices);
  const near = rt.filter(o => o.price <= min * 1.10).length;
  if (near < MIN_DATES) return null;
  const median = rt.length >= MIN_SAMPLES ? med(prices) : null;
  const distRow = rt.find(o => o.distance) || {};
  const distance = distRow.distance || null;
  const perKm = distance ? min / distance : null;
  const discount = median ? 1 - min / median : null;
  const byKm = perKm !== null && distance >= LONG_HAUL_KM && perKm < SEUIL_PAR_KM;
  const byMedian = discount !== null && discount >= DECOTE_MIN;
  if (!byKm && !byMedian) return null;
  const best = rt.filter(o => o.price === min).sort((a, b) => a.dep.localeCompare(b.dep))[0];
  return {
    from: route[0], to: route[1],
    price: min, median, discount: discount !== null ? Math.round(discount * 100) : null,
    distance, perKm: perKm !== null ? Math.round(perKm * 1000) / 1000 : null,
    dates: near, dep: best.dep, ret: best.ret, stops: best.changes,
    reasons: [byKm ? "prix/km" : null, byMedian ? "décote" : null].filter(Boolean),
    score: (byKm ? (SEUIL_PAR_KM - perKm) / SEUIL_PAR_KM * 100 : 0) + (byMedian ? discount * 100 : 0)
  };
}

// Route « prometteuse » : le meilleur prix passe un seuil de la charte mais le cache
// ne montre pas encore MIN_DATES dates proches. Le robot va alors chercher le
// calendrier du mois (densification) avant de trancher. Retourne la meilleure offre ou null.
function promising(route, offers) {
  const rt = (offers || []).filter(o => o.ret && o.price > 0);
  if (!rt.length) return null;
  const prices = rt.map(o => o.price);
  const min = Math.min.apply(null, prices);
  const near = rt.filter(o => o.price <= min * 1.10).length;
  if (near >= MIN_DATES) return null; // pas besoin : evaluate() a déjà tranché
  const median = rt.length >= MIN_SAMPLES ? med(prices) : null;
  const distance = (rt.find(o => o.distance) || {}).distance || null;
  const byKm = distance && distance >= LONG_HAUL_KM && min / distance < SEUIL_PAR_KM;
  const byMedian = median && 1 - min / median >= DECOTE_MIN;
  if (!byKm && !byMedian) return null;
  return rt.filter(o => o.price === min).sort((a, b) => a.dep.localeCompare(b.dep))[0];
}

// Diagnostic : résumé d'une route (nombre d'offres AR, min, médiane, distance, min €/km)
function stats(offers) {
  const rt = (offers || []).filter(o => o.ret && o.price > 0);
  if (!rt.length) return { n: 0 };
  const prices = rt.map(o => o.price), min = Math.min.apply(null, prices);
  const distance = (rt.find(o => o.distance) || {}).distance || null;
  return { n: rt.length, min, med: rt.length >= MIN_SAMPLES ? med(prices) : null, km: distance, perKm: distance ? Math.round(min / distance * 1000) / 1000 : null, near: rt.filter(o => o.price <= min * 1.10).length };
}

function med(nums) {
  const s = nums.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

module.exports = { SEUIL_PAR_KM, DECOTE_MIN, LONG_HAUL_KM, MIN_DATES, MIN_SAMPLES, ORIGINS, DESTINATIONS, basket, segmentSeat, itinerarySeat, evaluate, promising, stats, isoMinutes };
