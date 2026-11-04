// ============================================================
// AERYNDO — le palmarès : deals passés, réellement dénichés et vérifiés
//
// Chaque entrée est un tarif vu à l'écran de paiement (ou vérifié en direct sur Google Flights
// par le robot) à la date indiquée (foundAt). Formulation sur le site (v9) :
// « Trouvé à X € le … — il valait ~Y € · parti en N jours ».
// On ne prétend jamais qu'un visiteur a réservé : on montre ce que la chasse a trouvé.
// « was » = tarif habituel constaté sur la route à la même période (médiane du cache ou
// ordre de grandeur, d'où le tilde) ; null quand on ne l'a pas mesuré — on ne l'invente pas.
//
// Deux sources :
//   - LIST : les trouvailles historiques, écrites à la main ;
//   - palmarès AUTO (v9, 4 nov. 2026) : tout deal vérifié par le robot qui disparaît du site
//     (tarif parti, re-contrôle négatif, départ trop proche) bascule ici avec sa date de
//     découverte et sa date de disparition — scan.js appelle archive().
// Servi par /api/deals (champ « palmares ») et réutilisé par le robot Instagram.
// ============================================================
const S = require("./_store.js");

const LIST = [
  {
    id: "airindia-par-dps-2026-10", from: "CDG", to: "DPS", cityCode: "DPS",
    city: { fr: "Bali", en: "Bali" },
    carrier: "AI", carrierName: "Air India", aircraft: ["777", "321"], stops: 1,
    price: 2285, was: null, foundAt: "2026-10-13", goneAt: null, dep: "2027-01-07", ret: "2027-01-16",
    seat: { kind: "partial", fr: "Lit à plat sur CDG → DEL (777) ; siège classique sur le tronçon court.", en: "Flat bed on the long-haul leg (CDG → DEL, 777); standard seat on the short hop." },
    note: { fr: "Via Delhi. Vérifié sur Google Flights le 13 oct. 2026, publié sur Instagram le jour même.", en: "Via Delhi. Verified on Google Flights on 13 Oct 2026, posted on Instagram the same day." }
  },
  {
    id: "beond-cdg-mle-2026-08", from: "CDG", to: "MLE", cityCode: "MLE",
    city: { fr: "Maldives", en: "Maldives" },
    carrier: "B4", carrierName: "Beond", aircraft: ["319"], stops: 0,
    price: 3198, was: 4982, foundAt: "2026-08-21", dep: "2027-02-07", ret: "2027-02-20",
    seat: { kind: "flat", fr: "Avion 100 % Business : lit entièrement à plat sur tout le vol.", en: "All-Business aircraft: fully flat bed for the whole flight." },
    note: { fr: "Paris → Malé en direct, cabine 100 % Business.", en: "Paris → Malé nonstop, all-Business cabin." }
  },
  {
    id: "lacompagnie-ory-ewr-2026-08", from: "ORY", to: "EWR", cityCode: "NYC",
    city: { fr: "New York", en: "New York" },
    carrier: "B0", carrierName: "La Compagnie", aircraft: ["32Q"], stops: 0,
    price: 2012, was: 2422, foundAt: "2026-08-21", dep: "2026-09-25", ret: "2026-10-11",
    seat: { kind: "flat", fr: "Lit entièrement à plat, cabine 100 % Business (A321neo).", en: "Fully flat bed, all-Business cabin (A321neo)." },
    note: { fr: "Orly → Newark en direct.", en: "Orly → Newark nonstop." }
  },
  {
    id: "etihad-cdg-hkg-2026-08", from: "CDG", to: "HKG", cityCode: "HKG",
    city: { fr: "Hong Kong", en: "Hong Kong" },
    carrier: "EY", carrierName: "Etihad", aircraft: ["388", "789"], stops: 1,
    price: 2413, was: 3388, foundAt: "2026-08-21", dep: "2026-09-25", ret: "2026-10-04",
    seat: { kind: "flat", fr: "Lit entièrement à plat sur les deux tronçons (Business Studio, A380 + 787).", en: "Fully flat bed on both legs (Business Studio, A380 + 787)." },
    note: { fr: "Via Abu Dhabi.", en: "Via Abu Dhabi." }
  },
  {
    id: "kenya-cdg-mru-2026-09", from: "CDG", to: "MRU", cityCode: "MRU",
    city: { fr: "Île Maurice", en: "Mauritius" },
    carrier: "KQ", carrierName: "Kenya Airways", aircraft: ["788"], stops: 1,
    price: 2493, was: 3580, foundAt: "2026-09-01", dep: "2026-10-19", ret: "2026-10-27",
    seat: { kind: "partial", fr: "Lit à plat (787) sur les vols de nuit ; siège inclinable sur le saut de 4 h en journée via Nairobi.", en: "Flat bed (787) on the night flights; recliner on the 4-hour daytime hop via Nairobi." },
    note: { fr: "Via Nairobi, bagages et taxes compris.", en: "Via Nairobi, bags and taxes included." }
  }
];

// Noms de villes FR/EN pour le palmarès automatique ; au-delà de cette table, l'annuaire Travelpayouts (mémorisé 180 j).
const CITY = { MLE: { fr: "Maldives", en: "Maldives" }, NYC: { fr: "New York", en: "New York" }, HKG: { fr: "Hong Kong", en: "Hong Kong" }, MRU: { fr: "Île Maurice", en: "Mauritius" }, DXB: { fr: "Dubaï", en: "Dubai" }, TYO: { fr: "Tokyo", en: "Tokyo" }, BKK: { fr: "Bangkok", en: "Bangkok" }, SIN: { fr: "Singapour", en: "Singapore" }, DPS: { fr: "Bali", en: "Bali" }, HKT: { fr: "Phuket", en: "Phuket" }, DEL: { fr: "New Delhi", en: "New Delhi" }, BOM: { fr: "Mumbai", en: "Mumbai" }, SEL: { fr: "Séoul", en: "Seoul" }, OSA: { fr: "Osaka", en: "Osaka" }, SHA: { fr: "Shanghai", en: "Shanghai" }, BJS: { fr: "Pékin", en: "Beijing" }, CAN: { fr: "Canton", en: "Guangzhou" }, TPE: { fr: "Taipei", en: "Taipei" }, KUL: { fr: "Kuala Lumpur", en: "Kuala Lumpur" }, MNL: { fr: "Manille", en: "Manila" }, HAN: { fr: "Hanoï", en: "Hanoi" }, SGN: { fr: "Hô Chi Minh-Ville", en: "Ho Chi Minh City" }, CGK: { fr: "Jakarta", en: "Jakarta" }, CMB: { fr: "Colombo", en: "Colombo" }, KTM: { fr: "Katmandou", en: "Kathmandu" }, DOH: { fr: "Doha", en: "Doha" }, AUH: { fr: "Abu Dhabi", en: "Abu Dhabi" }, MCT: { fr: "Mascate", en: "Muscat" }, CAI: { fr: "Le Caire", en: "Cairo" }, TLV: { fr: "Tel-Aviv", en: "Tel Aviv" }, RUH: { fr: "Riyad", en: "Riyadh" }, JED: { fr: "Djeddah", en: "Jeddah" }, IST: { fr: "Istanbul", en: "Istanbul" }, JNB: { fr: "Johannesburg", en: "Johannesburg" }, CPT: { fr: "Le Cap", en: "Cape Town" }, NBO: { fr: "Nairobi", en: "Nairobi" }, ZNZ: { fr: "Zanzibar", en: "Zanzibar" }, SEZ: { fr: "Seychelles", en: "Seychelles" }, ADD: { fr: "Addis-Abeba", en: "Addis Ababa" }, DSS: { fr: "Dakar", en: "Dakar" }, CMN: { fr: "Casablanca", en: "Casablanca" }, RUN: { fr: "La Réunion", en: "Réunion" }, LAX: { fr: "Los Angeles", en: "Los Angeles" }, SFO: { fr: "San Francisco", en: "San Francisco" }, MIA: { fr: "Miami", en: "Miami" }, CHI: { fr: "Chicago", en: "Chicago" }, BOS: { fr: "Boston", en: "Boston" }, WAS: { fr: "Washington", en: "Washington" }, LAS: { fr: "Las Vegas", en: "Las Vegas" }, YTO: { fr: "Toronto", en: "Toronto" }, YUL: { fr: "Montréal", en: "Montreal" }, YVR: { fr: "Vancouver", en: "Vancouver" }, MEX: { fr: "Mexico", en: "Mexico City" }, CUN: { fr: "Cancún", en: "Cancún" }, HAV: { fr: "La Havane", en: "Havana" }, PUJ: { fr: "Punta Cana", en: "Punta Cana" }, RIO: { fr: "Rio de Janeiro", en: "Rio de Janeiro" }, SAO: { fr: "São Paulo", en: "São Paulo" }, BUE: { fr: "Buenos Aires", en: "Buenos Aires" }, LIM: { fr: "Lima", en: "Lima" }, BOG: { fr: "Bogotá", en: "Bogotá" }, SCL: { fr: "Santiago", en: "Santiago" }, SYD: { fr: "Sydney", en: "Sydney" }, MEL: { fr: "Melbourne", en: "Melbourne" }, PER: { fr: "Perth", en: "Perth" }, AKL: { fr: "Auckland", en: "Auckland" }, PAR: { fr: "Paris", en: "Paris" }, LON: { fr: "Londres", en: "London" }, ROM: { fr: "Rome", en: "Rome" }, MIL: { fr: "Milan", en: "Milan" }, MAD: { fr: "Madrid", en: "Madrid" }, LIS: { fr: "Lisbonne", en: "Lisbon" }, ATH: { fr: "Athènes", en: "Athens" } };
const CITY_OF = { CDG: "PAR", ORY: "PAR", LHR: "LON", LGW: "LON", LCY: "LON", JFK: "NYC", EWR: "NYC", HND: "TYO", NRT: "TYO", KIX: "OSA", MXP: "MIL", LIN: "MIL", FCO: "ROM", ICN: "SEL", PVG: "SHA", PEK: "BJS", PKX: "BJS", GRU: "SAO", GIG: "RIO", EZE: "BUE", ARN: "STO", YYZ: "YTO", ORD: "CHI", IAD: "WAS", DMK: "BKK", DWC: "DXB" };
const cityOf = c => CITY_OF[c] || c;

async function cityNames(code) {
  const c = cityOf(code);
  if (CITY[c]) return CITY[c];
  const k = "cityname:" + c;
  const cached = await S.get(k).catch(() => null); if (cached) return cached;
  const out = {};
  for (const lang of ["fr", "en"]) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch("https://autocomplete.travelpayouts.com/places2?locale=" + lang + "&types[]=city&types[]=airport&term=" + encodeURIComponent(c), { signal: ctrl.signal }).finally(() => clearTimeout(t));
      const arr = r.ok ? await r.json() : [];
      const hit = (Array.isArray(arr) ? arr : []).find(p => p.code === c) || (Array.isArray(arr) ? arr[0] : null);
      if (hit) out[lang] = hit.type === "airport" && hit.city_name ? hit.city_name : hit.name;
    } catch (e) { /* langue suivante */ }
  }
  const names = { fr: out.fr || out.en || c, en: out.en || out.fr || c };
  await S.set(k, names, 180 * 24 * 3600).catch(() => {});
  return names;
}

// Un deal vérifié qui quitte le site entre au palmarès (au plus 24 entrées automatiques, un an).
async function archive(deal, reason) {
  if (!deal || !deal.price || !deal.foundAt || !deal.verifiedAt) return null;
  const list = (await S.get("palmares:auto")) || [];
  const id = String(deal.id || (deal.from + "-" + deal.to)).toLowerCase() + "-" + deal.price;
  if (list.some(p => p.id === id)) return null;
  const seatKind = (deal.seat && deal.seat.kind) || "unknown";
  const leg = deal.seat && deal.seat.leg ? " (" + deal.seat.leg + ")" : "";
  const seatEn = seatKind === "flat" ? "Fully flat bed on the long-haul legs" + leg + "." : seatKind === "partial" ? "Flat bed on the long-haul leg" + leg + ", standard seat on the short hop." : seatKind === "recliner" ? "Recliner seat" + leg + " — not a bed." : "Seat type not disclosed.";
  const entry = {
    id, from: deal.from, to: deal.to, cityCode: cityOf(deal.to), city: await cityNames(deal.to),
    carrier: deal.carrier || null, carrierName: deal.carrierName || deal.carrier || null, aircraft: deal.aircraft || [], stops: typeof deal.stops === "number" ? deal.stops : null,
    price: deal.price, was: deal.median && deal.median > deal.price ? deal.median : null,
    foundAt: String(deal.foundAt).slice(0, 10), goneAt: new Date().toISOString().slice(0, 10), lastVerifiedAt: deal.verifiedAt, dep: deal.dep, ret: deal.ret,
    seat: { kind: seatKind, fr: (deal.seat && deal.seat.detail) || "Type de siège non communiqué.", en: seatEn },
    note: { fr: deal.source && deal.source.name ? "Repéré via " + deal.source.name + ", vérifié sur Google Flights." : "Déniché et vérifié sur Google Flights par le robot Aeryndo.", en: deal.source && deal.source.name ? "Spotted via " + deal.source.name + ", verified on Google Flights." : "Found and verified on Google Flights by the Aeryndo robot." },
    reason: reason || null, auto: true
  };
  list.unshift(entry);
  await S.set("palmares:auto", list.slice(0, 24), 365 * 24 * 3600);
  return entry;
}

// Liste publique : LIST + palmarès automatique, du plus récent au plus ancien, avec la remise et la durée de vie.
async function list() {
  let auto = [];
  try { auto = (await S.get("palmares:auto")) || []; } catch (e) { auto = []; }
  const all = LIST.concat(auto.filter(a => !LIST.some(l => l.from === a.from && l.to === a.to && l.price === a.price)));
  return all.sort((a, b) => b.foundAt.localeCompare(a.foundAt)).map(d => Object.assign({}, d, {
    discount: d.was > d.price ? Math.round((1 - d.price / d.was) * 100) : null,
    savings: d.was > d.price ? d.was - d.price : null,
    livedDays: d.goneAt ? Math.max(1, Math.round((Date.parse(d.goneAt) - Date.parse(d.foundAt)) / 86400000)) : null,
    photo: "/api/photo?city=" + d.cityCode
  }));
}

module.exports = { LIST, list, archive, cityNames };
