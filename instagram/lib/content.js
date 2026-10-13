// Choix du contenu à publier, selon le créneau :
//   deal  → le meilleur deal vérifié du moment (/api/deals), sinon un deal du palmarès pas encore posté récemment
//   piege → le prochain « piège de la semaine » de content/pieges.json (rotation)
//   reel  → le deal de la semaine (vendredi) ou, à défaut, le meilleur deal/palmarès disponible
// L'état (ce qui a déjà été posté) est lu/écrit dans ig-media/state.json par run.js.
const fs = require("fs");
const path = require("path");

const SITE = process.env.AERYNDO_SITE || "https://www.aeryndo.co";
const CITY = { MLE: { fr: "Maldives", en: "Maldives" }, NYC: { fr: "New York", en: "New York" }, HKG: { fr: "Hong Kong", en: "Hong Kong" }, MRU: { fr: "Île Maurice", en: "Mauritius" }, DXB: { fr: "Dubaï", en: "Dubai" }, TYO: { fr: "Tokyo", en: "Tokyo" }, BKK: { fr: "Bangkok", en: "Bangkok" }, SIN: { fr: "Singapour", en: "Singapore" }, HKT: { fr: "Phuket", en: "Phuket" }, DEL: { fr: "Delhi", en: "Delhi" }, BJS: { fr: "Pékin", en: "Beijing" }, SEL: { fr: "Séoul", en: "Seoul" }, CAN: { fr: "Canton", en: "Guangzhou" }, MCT: { fr: "Mascate", en: "Muscat" }, JNB: { fr: "Johannesburg", en: "Johannesburg" }, CPT: { fr: "Le Cap", en: "Cape Town" }, ZNZ: { fr: "Zanzibar", en: "Zanzibar" }, DSS: { fr: "Dakar", en: "Dakar" }, CUN: { fr: "Cancún", en: "Cancún" }, HAV: { fr: "La Havane", en: "Havana" }, PUJ: { fr: "Punta Cana", en: "Punta Cana" }, SJO: { fr: "San José", en: "San José" }, LIM: { fr: "Lima", en: "Lima" }, BOG: { fr: "Bogotá", en: "Bogotá" }, SCL: { fr: "Santiago", en: "Santiago" }, MVD: { fr: "Montevideo", en: "Montevideo" }, BSB: { fr: "Brasília", en: "Brasília" }, SSA: { fr: "Salvador de Bahia", en: "Salvador" }, REC: { fr: "Recife", en: "Recife" }, FOR: { fr: "Fortaleza", en: "Fortaleza" }, UIO: { fr: "Quito", en: "Quito" }, CUZ: { fr: "Cuzco", en: "Cusco" }, CTG: { fr: "Carthagène", en: "Cartagena" }, MDE: { fr: "Medellín", en: "Medellín" }, PTY: { fr: "Panama", en: "Panama City" }, SJU: { fr: "San Juan", en: "San Juan" }, MBJ: { fr: "Montego Bay", en: "Montego Bay" }, NAS: { fr: "Nassau", en: "Nassau" }, SDQ: { fr: "Saint-Domingue", en: "Santo Domingo" }, YVR: { fr: "Vancouver", en: "Vancouver" }, YUL: { fr: "Montréal", en: "Montreal" }, YYC: { fr: "Calgary", en: "Calgary" }, BOS: { fr: "Boston", en: "Boston" }, WAS: { fr: "Washington", en: "Washington" }, CHI: { fr: "Chicago", en: "Chicago" }, ATL: { fr: "Atlanta", en: "Atlanta" }, LAS: { fr: "Las Vegas", en: "Las Vegas" }, HNL: { fr: "Honolulu", en: "Honolulu" }, SEA: { fr: "Seattle", en: "Seattle" }, SAN: { fr: "San Diego", en: "San Diego" }, DEN: { fr: "Denver", en: "Denver" }, DFW: { fr: "Dallas", en: "Dallas" }, IAH: { fr: "Houston", en: "Houston" }, MCO: { fr: "Orlando", en: "Orlando" }, PHL: { fr: "Philadelphie", en: "Philadelphia" }, DTW: { fr: "Détroit", en: "Detroit" }, MSP: { fr: "Minneapolis", en: "Minneapolis" }, PHX: { fr: "Phoenix", en: "Phoenix" }, GDL: { fr: "Guadalajara", en: "Guadalajara" }, SJD: { fr: "Los Cabos", en: "Los Cabos" }, PVR: { fr: "Puerto Vallarta", en: "Puerto Vallarta" }, NBO: { fr: "Nairobi", en: "Nairobi" }, ADD: { fr: "Addis-Abeba", en: "Addis Ababa" }, DAR: { fr: "Dar es Salam", en: "Dar es Salaam" }, MBA: { fr: "Mombasa", en: "Mombasa" }, KGL: { fr: "Kigali", en: "Kigali" }, ACC: { fr: "Accra", en: "Accra" }, LOS: { fr: "Lagos", en: "Lagos" }, WDH: { fr: "Windhoek", en: "Windhoek" }, TNR: { fr: "Antananarivo", en: "Antananarivo" }, RUN: { fr: "La Réunion", en: "Réunion" }, CMN: { fr: "Casablanca", en: "Casablanca" }, RAK: { fr: "Marrakech", en: "Marrakesh" }, TUN: { fr: "Tunis", en: "Tunis" }, ALG: { fr: "Alger", en: "Algiers" }, AMM: { fr: "Amman", en: "Amman" }, TLV: { fr: "Tel Aviv", en: "Tel Aviv" }, RUH: { fr: "Riyad", en: "Riyadh" }, JED: { fr: "Djeddah", en: "Jeddah" }, BAH: { fr: "Bahreïn", en: "Bahrain" }, KWI: { fr: "Koweït", en: "Kuwait" }, IKA: { fr: "Téhéran", en: "Tehran" }, TAS: { fr: "Tachkent", en: "Tashkent" }, ALA: { fr: "Almaty", en: "Almaty" }, GYD: { fr: "Bakou", en: "Baku" }, TBS: { fr: "Tbilissi", en: "Tbilisi" }, EVN: { fr: "Erevan", en: "Yerevan" }, BOM: { fr: "Mumbai", en: "Mumbai" }, BLR: { fr: "Bangalore", en: "Bengaluru" }, MAA: { fr: "Chennai", en: "Chennai" }, GOI: { fr: "Goa", en: "Goa" }, COK: { fr: "Kochi", en: "Kochi" }, HYD: { fr: "Hyderabad", en: "Hyderabad" }, CCU: { fr: "Calcutta", en: "Kolkata" }, ISB: { fr: "Islamabad", en: "Islamabad" }, KHI: { fr: "Karachi", en: "Karachi" }, DAC: { fr: "Dacca", en: "Dhaka" }, KTM: { fr: "Katmandou", en: "Kathmandu" }, RGN: { fr: "Rangoun", en: "Yangon" }, HAN: { fr: "Hanoï", en: "Hanoi" }, SGN: { fr: "Hô Chi Minh-Ville", en: "Ho Chi Minh City" }, DAD: { fr: "Da Nang", en: "Da Nang" }, PNH: { fr: "Phnom Penh", en: "Phnom Penh" }, REP: { fr: "Siem Reap", en: "Siem Reap" }, VTE: { fr: "Vientiane", en: "Vientiane" }, PEN: { fr: "Penang", en: "Penang" }, LGK: { fr: "Langkawi", en: "Langkawi" }, SUB: { fr: "Surabaya", en: "Surabaya" }, USM: { fr: "Koh Samui", en: "Koh Samui" }, CNX: { fr: "Chiang Mai", en: "Chiang Mai" }, KBV: { fr: "Krabi", en: "Krabi" }, MNL: { fr: "Manille", en: "Manila" }, CEB: { fr: "Cebu", en: "Cebu" }, MFM: { fr: "Macao", en: "Macau" }, TPE: { fr: "Taipei", en: "Taipei" }, SZX: { fr: "Shenzhen", en: "Shenzhen" }, CTU: { fr: "Chengdu", en: "Chengdu" }, XIY: { fr: "Xi'an", en: "Xi'an" }, HGH: { fr: "Hangzhou", en: "Hangzhou" }, PUS: { fr: "Busan", en: "Busan" }, NGO: { fr: "Nagoya", en: "Nagoya" }, FUK: { fr: "Fukuoka", en: "Fukuoka" }, OKA: { fr: "Okinawa", en: "Okinawa" }, CTS: { fr: "Sapporo", en: "Sapporo" }, ULN: { fr: "Oulan-Bator", en: "Ulaanbaatar" }, MEL: { fr: "Melbourne", en: "Melbourne" }, BNE: { fr: "Brisbane", en: "Brisbane" }, ADL: { fr: "Adélaïde", en: "Adelaide" }, PER: { fr: "Perth", en: "Perth" }, AKL: { fr: "Auckland", en: "Auckland" }, CHC: { fr: "Christchurch", en: "Christchurch" }, NAN: { fr: "Fidji", en: "Fiji" }, PPT: { fr: "Tahiti", en: "Tahiti" }, NOU: { fr: "Nouméa", en: "Nouméa" }, HAK: { fr: "Haikou", en: "Haikou" }, SYX: { fr: "Sanya", en: "Sanya" }, CMB: { fr: "Colombo", en: "Colombo" }, SEZ: { fr: "Seychelles", en: "Seychelles" }, LED: { fr: "Saint-Pétersbourg", en: "Saint Petersburg" }, ATH: { fr: "Athènes", en: "Athens" }, LIS: { fr: "Lisbonne", en: "Lisbon" }, MAD: { fr: "Madrid", en: "Madrid" }, BCN: { fr: "Barcelone", en: "Barcelona" }, ROM: { fr: "Rome", en: "Rome" }, MIL: { fr: "Milan", en: "Milan" }, VIE: { fr: "Vienne", en: "Vienna" }, IST: { fr: "Istanbul", en: "Istanbul" }, AMS: { fr: "Amsterdam", en: "Amsterdam" }, FRA: { fr: "Francfort", en: "Frankfurt" }, MUC: { fr: "Munich", en: "Munich" }, ZRH: { fr: "Zurich", en: "Zurich" }, GVA: { fr: "Genève", en: "Geneva" }, BRU: { fr: "Bruxelles", en: "Brussels" }, CPH: { fr: "Copenhague", en: "Copenhagen" }, OSL: { fr: "Oslo", en: "Oslo" }, HEL: { fr: "Helsinki", en: "Helsinki" }, DUB: { fr: "Dublin", en: "Dublin" }, NCE: { fr: "Nice", en: "Nice" }, LYS: { fr: "Lyon", en: "Lyon" }, MRS: { fr: "Marseille", en: "Marseille" }, OSA: { fr: "Osaka", en: "Osaka" }, WAW: { fr: "Varsovie", en: "Warsaw" }, PRG: { fr: "Prague", en: "Prague" }, BUD: { fr: "Budapest", en: "Budapest" }, SYD: { fr: "Sydney", en: "Sydney" }, LAX: { fr: "Los Angeles", en: "Los Angeles" }, MIA: { fr: "Miami", en: "Miami" }, SEZ: { fr: "Seychelles", en: "Seychelles" }, CMB: { fr: "Colombo", en: "Colombo" }, DPS: { fr: "Bali", en: "Bali" }, KUL: { fr: "Kuala Lumpur", en: "Kuala Lumpur" }, DOH: { fr: "Doha", en: "Doha" }, AUH: { fr: "Abu Dhabi", en: "Abu Dhabi" }, CAI: { fr: "Le Caire", en: "Cairo" }, SAO: { fr: "São Paulo", en: "São Paulo" }, RIO: { fr: "Rio", en: "Rio" }, BUE: { fr: "Buenos Aires", en: "Buenos Aires" }, MEX: { fr: "Mexico", en: "Mexico City" }, YTO: { fr: "Toronto", en: "Toronto" }, SFO: { fr: "San Francisco", en: "San Francisco" }, LON: { fr: "Londres", en: "London" }, PAR: { fr: "Paris", en: "Paris" } };
// CDG/ORY → PAR, etc. (aéroports des villes à plusieurs plateformes)
const CITY_OF = { CDG: "PAR", ORY: "PAR", BVA: "PAR", LHR: "LON", LGW: "LON", LCY: "LON", STN: "LON", JFK: "NYC", EWR: "NYC", LGA: "NYC", MXP: "MIL", LIN: "MIL", FCO: "ROM", HND: "TYO", NRT: "TYO", KIX: "OSA", GIG: "RIO", GRU: "SAO", EZE: "BUE", ARN: "STO", YYZ: "YTO", ORD: "CHI", IAD: "WAS", DMK: "BKK", SVO: "MOW", DME: "MOW", CGK: "JKT", SAW: "IST", DWC: "DXB", PEK: "BJS", PKX: "BJS", PVG: "SHA", ICN: "SEL" };
function cityOf(code) { return CITY_OF[code] || code; }
// Nom de ville : table locale, sinon l'annuaire Travelpayouts (réseau disponible sur GitHub Actions), sinon null.
const nameCache = {};
async function cityNames(code) {
  const c = CITY[cityOf(code)] || CITY[code];
  if (c) return c;
  if (nameCache[code]) return nameCache[code];
  const out = {};
  for (const lang of ["fr", "en"]) {
    try {
      const r = await fetch("https://autocomplete.travelpayouts.com/places2?locale=" + lang + "&types[]=city&types[]=airport&term=" + encodeURIComponent(code));
      const arr = r.ok ? await r.json() : [];
      const hit = (Array.isArray(arr) ? arr : []).find(p => p.code === code) || (Array.isArray(arr) ? arr[0] : null);
      if (hit) out[lang] = hit.type === "airport" && hit.city_name ? hit.city_name : hit.name;
    } catch { }
  }
  if (!out.fr && !out.en) return null;
  out.fr = out.fr || out.en; out.en = out.en || out.fr;
  return (nameCache[code] = out);
}
// Codes IATA d'appareils → nom lisible sur le visuel
const AIRCRAFT = { "77W": "777-300ER", "77L": "777-200LR", "773": "777-300", "772": "777-200", "779": "777X", "788": "787-8", "789": "787-9", "781": "787-10", "787": "787", "351": "A350-1000", "359": "A350-900", "350": "A350", "388": "A380", "380": "A380", "338": "A330-800", "339": "A330-900neo", "332": "A330-200", "333": "A330-300", "330": "A330", "343": "A340-300", "346": "A340-600", "744": "747-400", "748": "747-8", "319": "A319", "320": "A320", "321": "A321", "32Q": "A321neo", "32N": "A320neo", "73H": "737-800", "738": "737-800", "7M8": "737 MAX 8", "E90": "E190", "CS3": "A220" };
function aircraftNames(list) { const seen = []; for (const a of list || []) { const n = AIRCRAFT[a] || a; if (!seen.includes(n)) seen.push(n); } return seen.join(" · "); }

async function getJson(url) { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error("HTTP " + r.status + " " + url); return r.json(); }

function fmtEUR(n) { return Math.round(n).toLocaleString("fr-FR") + " €"; }
function fmtEURen(n) { return "€" + Math.round(n).toLocaleString("en-GB"); }
function fmtDate(iso, lang) { return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T12:00:00")); }
function fmtDay(iso, lang) { return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00")); }

// Un deal vérifié du robot → objet de contenu normalisé (null si une information indispensable manque)
async function fromLiveDeal(d, site) {
  const seat = d.seat && d.seat.kind;
  if (seat !== "flat" && seat !== "partial") return null;          // on ne poste que ce dont le siège est connu
  if (!(d.carrierName || d.carrier)) return null;
  const city = await cityNames(d.to);
  if (!city) return null;
  // Le texte du siège vient du robot (il nomme le tronçon et l'appareil) ; l'anglais reste générique.
  const legFr = d.seat && d.seat.detail ? d.seat.detail.replace(/\.$/, "") : null;
  const seatTxt = {
    fr: seat === "flat" ? (legFr || "Lit entièrement à plat") : (legFr || "Lit à plat sur le long-courrier, siège classique sur le tronçon court"),
    en: seat === "flat" ? "Fully flat bed on the long-haul legs" + (d.seat && d.seat.leg ? " (" + d.seat.leg + ")" : "") : "Flat bed on the long-haul leg" + (d.seat && d.seat.leg ? " (" + d.seat.leg + ")" : "") + ", standard seat on the short hop"
  };
  const stops = { fr: d.stops === 0 ? "direct" : d.stops === 1 ? "1 escale" : d.stops + " escales", en: d.stops === 0 ? "nonstop" : d.stops === 1 ? "1 stop" : d.stops + " stops" };
  return {
    kind: "deal", id: "deal-" + d.id + "-" + d.price, live: true,
    from: d.from, to: d.to, city, cityCode: cityOf(d.to),
    price: d.price, was: d.median && d.median > d.price ? d.median : null, discount: d.discount || null,
    carrier: d.carrierName || d.carrier, aircraft: aircraftNames(d.aircraft), stops, seat: seatTxt, seatKind: seat,
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
    seat: { fr: p.seat.fr, en: p.seat.en }, seatKind: p.seat.kind, dep: p.dep, ret: p.ret, foundAt: p.foundAt, photo: (site || SITE) + p.photo,
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
  const real = (state.posted || []).filter(p => !p.dry);
  const posted = new Set(real.map(p => p.contentId));
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const live = (await Promise.all((j.deals || []).filter(d => fromMarket(d) && d.dep > soon).map(d => fromLiveDeal(d, site)))).filter(c => c && !posted.has(c.id));
  if (live.length) return live.sort((a, b) => (b.discount || 0) - (a.discount || 0) || a.price - b.price)[0];
  const recent = new Set(real.filter(p => Date.now() - Date.parse(p.at) < 60 * 86400000).map(p => p.contentId));
  const pal = (j.palmares || []).filter(fromMarket).map(p => fromPalmares(p, site)).filter(c => !recent.has(c.id));
  if (pal.length) return pal[Math.floor(Math.random() * pal.length)];
  return null;
}

function pickPiege(state, m) {
  const site = (m && m.site) || SITE;
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "pieges.json"), "utf8"));
  const posted = (state.posted || []).filter(p => !p.dry && p.contentId && p.contentId.startsWith("piege-"));
  const never = list.filter(p => !posted.some(x => x.contentId === p.id));
  const pick = never.length ? never[0] : list.slice().sort((a, b) => { const la = posted.filter(x => x.contentId === a.id).pop(), lb = posted.filter(x => x.contentId === b.id).pop(); return Date.parse(la ? la.at : 0) - Date.parse(lb ? lb.at : 0); })[0];
  return Object.assign({ kind: "piege", photo: site + "/api/photo?city=" + pick.city, cityCode: pick.city }, pick);
}

async function pick(slot, state, m) {
  if (slot.id === "piege") return pickPiege(state, m);
  if (slot.id === "deal" || slot.id === "reel") return pickDeal(state, m);
  // story : uniquement le post RÉEL du jour sur le créneau lié (jamais un brouillon ni le post de la semaine passée)
  if (slot.kind === "story") { const last = (state.posted || []).filter(p => !p.dry && p.igId && p.slot === slot.after && p.market === (m ? m.id : p.market) && p.date === slot.date).pop(); return last ? Object.assign({ kind: "story" }, last) : null; }
  return null;
}

module.exports = { pick, pickDeal, pickPiege, cityNames, cityOf, fmtEUR, fmtEURen, fmtDate, fmtDay, SITE };
