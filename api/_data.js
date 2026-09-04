// ============================================================
// AERYNDO — données et helpers partagés par les fonctions /api
// Fichier préfixé "_" : Vercel ne le déploie pas comme endpoint.
// Zéro dépendance npm : fetch natif de Node 18+.
// ============================================================

// Marker Travelpayouts (partenaire). Les sous-identifiants (après le point)
// servent à distinguer la source du clic dans les stats Travelpayouts.
const MARKER = "745122";
const SUB = { radar: "radar", search: "site-search", deal: "site-deal", deck: "site-deck", mail: "radar-mail" };

const PARTNER_HOST = "aviasales.fr";
const CURRENCY = "eur";
const TP_API = "https://api.travelpayouts.com";

// Routes surveillées par le Radar (bloc vivant de la première page + alerte nocturne).
// "normal" = tarif Business habituel constaté sur la route, sert à calculer la remise.
const ROUTES = [
  { o: "CDG", d: "JFK", city: "New York",  country: "États-Unis",        normal: 2600 },
  { o: "CDG", d: "DXB", city: "Dubaï",     country: "Émirats arabes unis", normal: 2400 },
  { o: "CDG", d: "HND", city: "Tokyo",     country: "Japon",             normal: 3200 },
  { o: "CDG", d: "NRT", city: "Tokyo Narita", country: "Japon",          normal: 3200 },
  { o: "CDG", d: "BKK", city: "Bangkok",   country: "Thaïlande",         normal: 2800 },
  { o: "CDG", d: "SIN", city: "Singapour", country: "Singapour",         normal: 3000 },
  { o: "CDG", d: "MLE", city: "Maldives",  country: "Maldives",          normal: 3400 },
  { o: "CDG", d: "HKG", city: "Hong Kong", country: "Hong Kong",         normal: 3100 },
  { o: "CDG", d: "LAX", city: "Los Angeles", country: "États-Unis",      normal: 3000 },
  { o: "NCE", d: "JFK", city: "New York",  country: "États-Unis (dép. Nice)", normal: 2800 }
];

// Seuil d'alerte email : prix <= 65 % de la normale de la route
const THRESHOLD = 0.65;

// ---------- dates ----------
function todayISO() { return new Date().toISOString().slice(0, 10); }
function ddmm(iso) { const p = String(iso || "").split("-"); return p.length === 3 ? p[2] + p[1] : ""; }
function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isMonth(s) { return /^\d{4}-\d{2}$/.test(s || ""); }
function isIATA(s) { return /^[A-Z]{3}$/.test(s || ""); }

// ---------- lien de réservation Aviasales ----------
// Format du chemin : ORIG DDMM DEST [DDMM] c<adultes>  ("c" = Business, casse sensible)
function aviasalesLink({ from, to, dep, ret, pax, sub }) {
  const adults = Math.min(9, Math.max(1, parseInt(pax, 10) || 1));
  const path = from + ddmm(dep) + to + (ret ? ddmm(ret) : "") + "c" + adults;
  const marker = MARKER + (sub ? "." + sub : "");
  return `https://www.${PARTNER_HOST}/search/${path}?marker=${marker}&currency=${CURRENCY}&locale=fr`;
}

// ---------- appel Travelpayouts Data API ----------
async function tpFetch(path, params, token) {
  const qs = new URLSearchParams(params).toString();
  const url = TP_API + path + (qs ? "?" + qs : "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(url, { headers: { "X-Access-Token": token, "Accept": "application/json" }, signal: ctrl.signal });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, error: "HTTP " + resp.status + " " + body.slice(0, 200), data: null };
    }
    const json = await resp.json();
    return { ok: true, status: 200, data: json };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e), data: null };
  } finally { clearTimeout(t); }
}

// Normalise une ligne de /v2/prices/latest ou /v2/prices/month-matrix en offre unique.
// Retourne null si la ligne est inutilisable ou n'est pas de la classe Business.
function normalizeOffer(x, today) {
  if (!x || !x.value || !x.depart_date) return null;
  const dep = String(x.depart_date).slice(0, 10);           // v3 renvoie parfois date + heure
  const ret = x.return_date ? String(x.return_date).slice(0, 10) : null;
  if (dep <= today) return null;
  if (x.trip_class !== 1) return null; // garde-fou : Business uniquement (certains endpoints ignorent trip_class)
  return {
    price: Math.round(x.value),
    dep,
    ret,
    changes: typeof x.number_of_changes === "number" ? x.number_of_changes : null,
    duration: x.duration || null,          // minutes (quand fourni)
    gate: x.gate || null,                  // agence / source du tarif
    found: x.found_at || null,             // horodatage de la découverte
    actual: x.actual !== false
  };
}

// Fusionne plusieurs listes d'offres : une seule par couple (aller, retour), la moins chère.
function mergeOffers(lists) {
  const map = new Map();
  for (const list of lists) for (const o of list) {
    if (!o) continue;
    const k = o.dep + "|" + (o.ret || "");
    const prev = map.get(k);
    if (!prev || o.price < prev.price) map.set(k, o);
  }
  return [...map.values()];
}

// Toutes les offres Business connues sur une route (année glissante).
// Source : /aviasales/v3/get_latest_prices — le seul endpoint « latest » qui accepte encore
// trip_class=1 (/v2/prices/latest répond « Only economy trip class is supported »).
async function fetchLatest(token, from, to, oneWay, extra) {
  const params = Object.assign({
    currency: CURRENCY, origin: from, destination: to,
    trip_class: 1, period_type: "year", one_way: oneWay ? "true" : "false",
    page: 1, limit: 1000, sorting: "price", show_to_affiliates: "true", token
  }, extra || {});
  const r = await tpFetch("/aviasales/v3/get_latest_prices", params, token);
  if (!r.ok) return { ok: false, status: r.status, error: r.error, offers: [] };
  const today = todayISO();
  const offers = ((r.data && r.data.data) || []).map(x => normalizeOffer(x, today)).filter(Boolean);
  return { ok: true, offers };
}

// Densification d'un mois : /v2/prices/month-matrix accepte trip_class=1 et renvoie
// les tarifs Business jour par jour (les lignes non-Business sont écartées par normalizeOffer).
async function fetchMonthMatrix(token, from, to, oneWay, month) {
  const params = {
    currency: CURRENCY, origin: from, destination: to, month: month + "-01",
    trip_class: 1, one_way: oneWay ? "true" : "false", show_to_affiliates: "true"
  };
  const r = await tpFetch("/v2/prices/month-matrix", params, token);
  if (!r.ok) return { ok: false, status: r.status, error: r.error, offers: [] };
  const today = todayISO();
  const offers = ((r.data && r.data.data) || []).map(x => normalizeOffer(x, today)).filter(Boolean);
  return { ok: true, offers };
}

// ---------- compagnies aériennes : liens directs ----------
// Chaque entrée : nom + URL du site (page d'accueil FR quand elle existe).
// "aff" (optionnel) : URL affiliée à utiliser à la place de "url" si un programme
// partenaire est ouvert un jour ; le front affiche "lien direct" dans tous les cas.
const AIRLINES = {
  AF: { name: "Air France",          url: "https://wwws.airfrance.fr/" },
  KL: { name: "KLM",                 url: "https://www.klm.fr/" },
  LH: { name: "Lufthansa",           url: "https://www.lufthansa.com/fr/fr/homepage" },
  LX: { name: "Swiss",               url: "https://www.swiss.com/fr/fr/homepage" },
  OS: { name: "Austrian",            url: "https://www.austrian.com/fr/fr/homepage" },
  SN: { name: "Brussels Airlines",   url: "https://www.brusselsairlines.com/fr-fr" },
  BA: { name: "British Airways",     url: "https://www.britishairways.com/travel/home/public/fr_fr/" },
  VS: { name: "Virgin Atlantic",     url: "https://www.virginatlantic.com/" },
  IB: { name: "Iberia",              url: "https://www.iberia.com/fr/" },
  TP: { name: "TAP Air Portugal",    url: "https://www.flytap.com/fr-fr/" },
  AZ: { name: "ITA Airways",         url: "https://www.ita-airways.com/fr_fr" },
  AY: { name: "Finnair",             url: "https://www.finnair.com/fr-fr" },
  SK: { name: "SAS",                 url: "https://www.flysas.com/fr-fr/" },
  LO: { name: "LOT",                 url: "https://www.lot.com/fr/fr" },
  EI: { name: "Aer Lingus",          url: "https://www.aerlingus.com/" },
  FI: { name: "Icelandair",          url: "https://www.icelandair.com/fr-fr/" },
  B0: { name: "La Compagnie",        url: "https://www.lacompagnie.com/fr" },
  EK: { name: "Emirates",            url: "https://www.emirates.com/fr/french/" },
  QR: { name: "Qatar Airways",       url: "https://www.qatarairways.com/fr-fr/homepage.html" },
  EY: { name: "Etihad",              url: "https://www.etihad.com/fr-fr/" },
  TK: { name: "Turkish Airlines",    url: "https://www.turkishairlines.com/fr-fr/" },
  WY: { name: "Oman Air",            url: "https://www.omanair.com/fr" },
  GF: { name: "Gulf Air",            url: "https://www.gulfair.com/" },
  KU: { name: "Kuwait Airways",      url: "https://www.kuwaitairways.com/" },
  SV: { name: "Saudia",              url: "https://www.saudia.com/" },
  RJ: { name: "Royal Jordanian",     url: "https://www.rj.com/" },
  ME: { name: "Middle East Airlines",url: "https://www.mea.com.lb/" },
  LY: { name: "El Al",               url: "https://www.elal.com/fr/" },
  MS: { name: "EgyptAir",            url: "https://www.egyptair.com/fr" },
  AT: { name: "Royal Air Maroc",     url: "https://www.royalairmaroc.com/fr-fr" },
  TU: { name: "Tunisair",            url: "https://www.tunisair.com/" },
  AH: { name: "Air Algérie",         url: "https://airalgerie.dz/" },
  ET: { name: "Ethiopian",           url: "https://www.ethiopianairlines.com/fr" },
  KQ: { name: "Kenya Airways",       url: "https://www.kenya-airways.com/fr-fr/" },
  SA: { name: "South African Airways", url: "https://www.flysaa.com/" },
  MK: { name: "Air Mauritius",       url: "https://www.airmauritius.com/fr" },
  UU: { name: "Air Austral",         url: "https://www.air-austral.com/" },
  SQ: { name: "Singapore Airlines",  url: "https://www.singaporeair.com/fr_FR/fr/home" },
  CX: { name: "Cathay Pacific",      url: "https://www.cathaypacific.com/cx/fr_FR.html" },
  JL: { name: "Japan Airlines",      url: "https://www.jal.co.jp/fr/fr/" },
  NH: { name: "ANA",                 url: "https://www.ana.co.jp/fr/fr/" },
  KE: { name: "Korean Air",          url: "https://www.koreanair.com/fr/fr" },
  OZ: { name: "Asiana",              url: "https://flyasiana.com/C/FR/FR/index" },
  CI: { name: "China Airlines",      url: "https://www.china-airlines.com/fr-fr" },
  BR: { name: "EVA Air",             url: "https://www.evaair.com/fr-fr/" },
  CA: { name: "Air China",           url: "https://www.airchina.fr/" },
  MU: { name: "China Eastern",       url: "https://fr.ceair.com/" },
  CZ: { name: "China Southern",      url: "https://www.csair.com/fr/" },
  TG: { name: "Thai Airways",        url: "https://www.thaiairways.com/fr_FR/index.page" },
  MH: { name: "Malaysia Airlines",   url: "https://www.malaysiaairlines.com/fr/fr.html" },
  GA: { name: "Garuda Indonesia",    url: "https://www.garuda-indonesia.com/" },
  VN: { name: "Vietnam Airlines",    url: "https://www.vietnamairlines.com/fr/fr/home" },
  PR: { name: "Philippine Airlines", url: "https://www.philippineairlines.com/" },
  AI: { name: "Air India",           url: "https://www.airindia.com/" },
  UL: { name: "SriLankan Airlines",  url: "https://www.srilankan.com/fr_fr/fr" },
  Q2: { name: "Maldivian",           url: "https://maldivian.aero/" },
  BE: { name: "Beond",               url: "https://www.flybeond.com/" },
  QF: { name: "Qantas",              url: "https://www.qantas.com/fr/fr.html" },
  NZ: { name: "Air New Zealand",     url: "https://www.airnewzealand.fr/" },
  DL: { name: "Delta",               url: "https://fr.delta.com/" },
  UA: { name: "United",              url: "https://www.united.com/fr/fr" },
  AA: { name: "American Airlines",   url: "https://www.americanairlines.fr/" },
  AC: { name: "Air Canada",          url: "https://www.aircanada.com/fr-fr/" },
  AM: { name: "Aeroméxico",          url: "https://aeromexico.com/fr-fr" },
  LA: { name: "LATAM",               url: "https://www.latamairlines.com/fr/fr" },
  AR: { name: "Aerolíneas Argentinas", url: "https://www.aerolineas.com.ar/" },
  AV: { name: "Avianca",             url: "https://www.avianca.com/fr/" },
  CM: { name: "Copa Airlines",       url: "https://www.copaair.com/fr/" },
  TX: { name: "Air Caraïbes",        url: "https://www.aircaraibes.com/" },
  SS: { name: "Corsair",             url: "https://www.flycorsair.com/fr" },
  TO: { name: "Transavia",           url: "https://www.transavia.com/fr-FR/" },
  BF: { name: "French bee",          url: "https://www.frenchbee.com/fr" }
};

// Aéroports d'origine français → compagnie(s) « maison »
const FRENCH = new Set(["CDG", "ORY", "NCE", "LYS", "MRS", "TLS", "BOD", "NTE", "BSL", "MPL", "SXB", "LIL", "BIQ", "PTP", "FDF", "RUN"]);

// Compagnies plausibles par aéroport de destination (vols directs ou 1 escale).
const DEST_AIRLINES = {
  JFK: ["DL", "AA", "UA", "B0", "BA", "VS"], EWR: ["UA", "B0", "DL"], BOS: ["DL", "AA", "UA"], IAD: ["UA", "AA"],
  ORD: ["UA", "AA"], ATL: ["DL"], MIA: ["AA", "DL", "SS"], LAX: ["DL", "AA", "UA", "TX", "BF"], SFO: ["UA", "DL", "BF"],
  YUL: ["AC", "TX", "TS"], YYZ: ["AC"], YVR: ["AC"], MEX: ["AM"], CUN: ["AM", "TX"], PTP: ["TX", "SS"], FDF: ["TX", "SS"],
  GRU: ["LA", "TP"], GIG: ["LA", "TP"], EZE: ["AR", "LA"], SCL: ["LA"], LIM: ["LA", "AV"], BOG: ["AV"], PTY: ["CM"],
  DXB: ["EK"], AUH: ["EY"], DOH: ["QR"], MCT: ["WY"], BAH: ["GF"], KWI: ["KU"], RUH: ["SV"], JED: ["SV"],
  AMM: ["RJ"], BEY: ["ME"], TLV: ["LY"], CAI: ["MS"], CMN: ["AT"], RAK: ["AT"], TUN: ["TU"], ALG: ["AH"],
  ADD: ["ET"], NBO: ["KQ"], JNB: ["SA", "EK", "QR"], CPT: ["SA", "EK", "QR"], MRU: ["MK", "SS"], RUN: ["UU", "SS", "BF"],
  DKR: ["SS", "TX"], ABJ: ["SS", "ET"], LOS: ["ET", "TK"], ACC: ["ET", "TK"],
  DEL: ["AI", "EK", "QR"], BOM: ["AI", "EK", "QR"], BLR: ["AI", "EK", "QR"], MAA: ["EK", "QR"], HYD: ["EK", "QR"],
  BKK: ["TG", "EK", "QR"], HKT: ["TG", "EK", "QR"], SIN: ["SQ", "EK", "QR"], KUL: ["MH", "EK", "QR"], CGK: ["GA", "SQ", "QR"],
  DPS: ["GA", "SQ", "QR", "EK"], MNL: ["PR", "EK", "QR"], HKG: ["CX", "EY", "QR"], TPE: ["CI", "BR", "EK"],
  ICN: ["KE", "OZ", "EK"], GMP: ["KE", "OZ"], NRT: ["JL", "NH", "EK", "QR"], HND: ["JL", "NH", "EK", "QR"], KIX: ["JL", "NH", "EK"],
  PEK: ["CA", "EK", "QR"], PKX: ["CA", "MU"], PVG: ["MU", "CA", "EK"], CAN: ["CZ", "EK"], SZX: ["CZ", "EK"], CTU: ["CA", "CZ"],
  HAN: ["VN", "EK", "QR"], SGN: ["VN", "EK", "QR"], CMB: ["UL", "EK", "QR"], MLE: ["BE", "Q2", "EK", "QR", "TK"], KTM: ["QR", "TK"],
  SYD: ["QF", "EK", "QR", "SQ"], MEL: ["QF", "EK", "QR", "SQ"], BNE: ["QF", "EK", "SQ"], PER: ["QF", "EK", "QR"], AKL: ["NZ", "EK", "QR", "SQ"],
  LHR: ["BA", "VS"], LGW: ["BA"], LCY: ["BA"], MAN: ["BA"], EDI: ["BA"], DUB: ["EI"], AMS: ["KL"], BRU: ["SN"],
  FRA: ["LH"], MUC: ["LH"], BER: ["LH"], DUS: ["LH"], HAM: ["LH"], ZRH: ["LX"], GVA: ["LX"], VIE: ["OS"],
  MAD: ["IB"], BCN: ["IB"], AGP: ["IB"], PMI: ["IB"], LIS: ["TP"], OPO: ["TP"], FCO: ["AZ"], MXP: ["AZ", "B0"], LIN: ["AZ"],
  VCE: ["AZ"], NAP: ["AZ"], ATH: ["AZ"], IST: ["TK"], SAW: ["TK"], CPH: ["SK"], ARN: ["SK"], OSL: ["SK"], HEL: ["AY"], KEF: ["FI"],
  WAW: ["LO"], PRG: ["LO"], BUD: ["LO"], OTP: ["TK"]
};

// Grands transporteurs de connexion vers les longs-courriers Asie / Océanie / Afrique australe
const LONG_HAUL_CONNECTORS = ["EK", "QR", "EY", "TK"];
const LONG_HAUL = new Set(["BKK", "HKT", "SIN", "KUL", "CGK", "DPS", "MNL", "HKG", "TPE", "ICN", "GMP", "NRT", "HND", "KIX",
  "PEK", "PKX", "PVG", "CAN", "SZX", "CTU", "HAN", "SGN", "CMB", "MLE", "KTM", "SYD", "MEL", "BNE", "PER", "AKL",
  "DEL", "BOM", "BLR", "MAA", "HYD", "JNB", "CPT", "NBO", "ADD", "MRU"]);

// Compagnies proposées pour une route : maison + destination + connecteurs, sans doublon, max 6.
function airlinesFor(from, to) {
  const codes = [];
  const push = c => { if (AIRLINES[c] && !codes.includes(c)) codes.push(c); };
  if (FRENCH.has(from)) { push("AF"); if (from === "ORY" && ["EWR", "JFK", "MXP"].includes(to)) push("B0"); }
  (DEST_AIRLINES[to] || []).forEach(push);
  if (LONG_HAUL.has(to)) LONG_HAUL_CONNECTORS.forEach(push);
  return codes.slice(0, 6).map(c => ({ code: c, name: AIRLINES[c].name, url: AIRLINES[c].aff || AIRLINES[c].url, aff: !!AIRLINES[c].aff }));
}

// ---------- réponse HTTP ----------
function sendJson(res, status, body, cacheSeconds) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (cacheSeconds && status === 200) {
    // Cache CDN Vercel : réponses partagées entre visiteurs, revalidation en arrière-plan.
    res.setHeader("Cache-Control", `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 12}`);
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.status(status).end(JSON.stringify(body));
}

module.exports = {
  MARKER, SUB, PARTNER_HOST, CURRENCY, ROUTES, THRESHOLD,
  todayISO, ddmm, isISODate, isMonth, isIATA,
  aviasalesLink, tpFetch, normalizeOffer, mergeOffers, fetchLatest, fetchMonthMatrix, sendJson,
  AIRLINES, airlinesFor
};
