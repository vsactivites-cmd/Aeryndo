// Choix du contenu à publier, selon le créneau :
//   deal  → le meilleur deal vérifié du moment (/api/deals), sinon un deal du palmarès pas encore posté récemment
//   piege → le prochain « piège de la semaine » de content/pieges.json (rotation)
//   reel  → le deal de la semaine (vendredi) ou, à défaut, le meilleur deal/palmarès disponible
// L'état (ce qui a déjà été posté) est lu/écrit dans ig-media/state.json par run.js.
const fs = require("fs");
const path = require("path");

const SITE = process.env.AERYNDO_SITE || "https://www.aeryndo.co";
const CITY = { MLE: { fr: "Maldives", en: "Maldives" }, NYC: { fr: "New York", en: "New York" }, HKG: { fr: "Hong Kong", en: "Hong Kong" }, MRU: { fr: "Île Maurice", en: "Mauritius" }, DXB: { fr: "Dubaï", en: "Dubai" }, TYO: { fr: "Tokyo", en: "Tokyo" }, BKK: { fr: "Bangkok", en: "Bangkok" }, SIN: { fr: "Singapour", en: "Singapore" }, HKT: { fr: "Phuket", en: "Phuket" }, DEL: { fr: "Delhi", en: "Delhi" }, BJS: { fr: "Pékin", en: "Beijing" }, SEL: { fr: "Séoul", en: "Seoul" }, CAN: { fr: "Canton", en: "Guangzhou" }, MCT: { fr: "Mascate", en: "Muscat" }, JNB: { fr: "Johannesburg", en: "Johannesburg" }, CPT: { fr: "Le Cap", en: "Cape Town" }, ZNZ: { fr: "Zanzibar", en: "Zanzibar" }, DSS: { fr: "Dakar", en: "Dakar" }, SYD: { fr: "Sydney", en: "Sydney" }, LAX: { fr: "Los Angeles", en: "Los Angeles" }, MIA: { fr: "Miami", en: "Miami" }, SEZ: { fr: "Seychelles", en: "Seychelles" }, CMB: { fr: "Colombo", en: "Colombo" }, DPS: { fr: "Bali", en: "Bali" }, KUL: { fr: "Kuala Lumpur", en: "Kuala Lumpur" }, DOH: { fr: "Doha", en: "Doha" }, AUH: { fr: "Abu Dhabi", en: "Abu Dhabi" }, CAI: { fr: "Le Caire", en: "Cairo" }, SAO: { fr: "São Paulo", en: "São Paulo" }, RIO: { fr: "Rio", en: "Rio" }, BUE: { fr: "Buenos Aires", en: "Buenos Aires" }, MEX: { fr: "Mexico", en: "Mexico City" }, YTO: { fr: "Toronto", en: "Toronto" }, SFO: { fr: "San Francisco", en: "San Francisco" }, LON: { fr: "Londres", en: "London" }, PAR: { fr: "Paris", en: "Paris" } };
function cityName(code, lang) { const c = CITY[code]; return c ? c[lang] || c.fr : code; }
// Codes IATA d'appareils → nom lisible sur le visuel
const AIRCRAFT = { "77W": "777-300ER", "77L": "777-200LR", "773": "777-300", "772": "777-200", "779": "777X", "788": "787-8", "789": "787-9", "781": "787-10", "787": "787", "351": "A350-1000", "359": "A350-900", "350": "A350", "388": "A380", "380": "A380", "338": "A330-800", "339": "A330-900neo", "332": "A330-200", "333": "A330-300", "330": "A330", "343": "A340-300", "346": "A340-600", "744": "747-400", "748": "747-8", "319": "A319", "320": "A320", "321": "A321", "32Q": "A321neo", "32N": "A320neo", "73H": "737-800", "738": "737-800", "7M8": "737 MAX 8", "E90": "E190", "CS3": "A220" };
function aircraftNames(list) { const seen = []; for (const a of list || []) { const n = AIRCRAFT[a] || a; if (!seen.includes(n)) seen.push(n); } return seen.join(" · "); }

async function getJson(url) { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error("HTTP " + r.status + " " + url); return r.json(); }

function fmtEUR(n) { return Math.round(n).toLocaleString("fr-FR") + " €"; }
function fmtEURen(n) { return "€" + Math.round(n).toLocaleString("en-GB"); }
function fmtDate(iso, lang) { return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T12:00:00")); }
function fmtDay(iso, lang) { return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00")); }

// Un deal vérifié du robot → objet de contenu normalisé
function fromLiveDeal(d, site) {
  const seat = d.seat && d.seat.kind;
  const seatTxt = {
    fr: seat === "flat" ? "Lit entièrement à plat" : seat === "partial" ? "Lit à plat sur le long-courrier, siège classique sur le tronçon court" : "Siège vérifié",
    en: seat === "flat" ? "Fully flat bed" : seat === "partial" ? "Flat bed on the long-haul leg, standard seat on the short hop" : "Seat verified"
  };
  const stops = { fr: d.stops === 0 ? "direct" : d.stops === 1 ? "1 escale" : d.stops + " escales", en: d.stops === 0 ? "nonstop" : d.stops === 1 ? "1 stop" : d.stops + " stops" };
  return {
    kind: "deal", id: "deal-" + d.id + "-" + d.price, live: true,
    from: d.from, to: d.to, city: { fr: cityName(d.to, "fr"), en: cityName(d.to, "en") }, cityCode: d.to,
    price: d.price, was: d.median && d.median > d.price ? d.median : null, discount: d.discount || null,
    carrier: d.carrierName || d.carrier, aircraft: aircraftNames(d.aircraft), stops, seat: seatTxt,
    dep: d.dep, ret: d.ret, verifiedAt: d.verifiedAt, link: d.link, photo: (site || SITE) + d.photo,
    kicker: { fr: "Deal vérifié · " + fmtDay(d.verifiedAt.slice(0, 10), "fr"), en: "Verified deal · " + fmtDay(d.verifiedAt.slice(0, 10), "en") },
    source: d.source || null
  };
}
// Un deal du palmarès → même forme, formulé au passé
function fromPalmares(p, site) {
  return {
    kind: "palmares", id: "pal-" + p.id, live: false,
    from: p.from, to: p.to, city: p.city, cityCode: p.cityCode,
    price: p.price, was: p.was, discount: p.discount, carrier: p.carrierName, aircraft: aircraftNames(p.aircraft),
    stops: { fr: p.stops === 0 ? "direct" : p.stops === 1 ? "1 escale" : p.stops + " escales", en: p.stops === 0 ? "nonstop" : p.stops === 1 ? "1 stop" : p.stops + " stops" },
    seat: { fr: p.seat.fr, en: p.seat.en }, dep: p.dep, ret: p.ret, foundAt: p.foundAt, photo: (site || SITE) + p.photo,
    kicker: { fr: "Déniché le " + fmtDate(p.foundAt, "fr"), en: "Found on " + fmtDate(p.foundAt, "en") }
  };
}

// Les deals postés partent des aéroports du marché (m.origins) : un compte péruvien ne verra
// que des départs de Lima, le compte français des départs de Paris/Nice/Lyon…
// Si aucun deal vérifié ne part du marché, on prend le palmarès du marché ; sinon rien (pas de post forcé).
async function pickDeal(state, m) {
  const site = (m && m.site) || SITE;
  const origins = new Set((m && m.origins) || []);
  const fromMarket = d => !origins.size || origins.has(d.from) || origins.has(cityOf(d.from));
  const j = await getJson(site + "/api/deals?ig=1");
  const posted = new Set((state.posted || []).map(p => p.contentId));
  const live = (j.deals || []).filter(d => d.seat && d.seat.kind !== "recliner" && fromMarket(d)).map(d => fromLiveDeal(d, site)).filter(c => !posted.has(c.id));
  if (live.length) return live.sort((a, b) => (b.discount || 0) - (a.discount || 0) || a.price - b.price)[0];
  const recent = new Set((state.posted || []).filter(p => Date.now() - Date.parse(p.at) < 60 * 86400000).map(p => p.contentId));
  const pal = (j.palmares || []).filter(fromMarket).map(p => fromPalmares(p, site)).filter(c => !recent.has(c.id));
  if (pal.length) return pal[Math.floor(Math.random() * pal.length)];
  return null;
}
// CDG/ORY → PAR, etc. (les aéroports des villes à plusieurs plateformes)
const CITY_OF = { CDG: "PAR", ORY: "PAR", BVA: "PAR", LHR: "LON", LGW: "LON", LCY: "LON", STN: "LON", JFK: "NYC", EWR: "NYC", LGA: "NYC", MXP: "MIL", LIN: "MIL", FCO: "ROM", HND: "TYO", NRT: "TYO", LIM: "LIM" };
function cityOf(code) { return CITY_OF[code] || code; }

function pickPiege(state, m) {
  const site = (m && m.site) || SITE;
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "pieges.json"), "utf8"));
  const posted = (state.posted || []).filter(p => p.contentId && p.contentId.startsWith("piege-"));
  const never = list.filter(p => !posted.some(x => x.contentId === p.id));
  const pick = never.length ? never[0] : list.slice().sort((a, b) => { const la = posted.filter(x => x.contentId === a.id).pop(), lb = posted.filter(x => x.contentId === b.id).pop(); return Date.parse(la ? la.at : 0) - Date.parse(lb ? lb.at : 0); })[0];
  return Object.assign({ kind: "piege", photo: site + "/api/photo?city=" + pick.city, cityCode: pick.city }, pick);
}

async function pick(slot, state, m) {
  if (slot.id === "piege") return pickPiege(state, m);
  if (slot.id === "deal" || slot.id === "reel") return pickDeal(state, m);
  if (slot.kind === "story") { const last = (state.posted || []).filter(p => p.slot === slot.after).pop(); return last ? Object.assign({ kind: "story" }, last) : null; }
  return null;
}

module.exports = { pick, pickDeal, pickPiege, cityName, fmtEUR, fmtEURen, fmtDate, fmtDay, SITE };
