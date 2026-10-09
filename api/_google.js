// ============================================================
// AERYNDO — vérification en temps réel via Google Flights (SerpApi)
//
// Remplace Amadeus Self-Service (portail fermé le 17 juillet 2026).
// SerpApi interroge Google Flights en direct et renvoie les mêmes
// tarifs que ceux qu'un voyageur voit sur google.com/flights : prix
// aller-retour, compagnie, appareil, escales, cabine par tronçon.
//
// Variables Vercel :
//   SERPAPI_KEY   (serpapi.com → compte gratuit : 250 recherches / mois)
// Zéro dépendance npm : fetch natif.
// ============================================================

const KEY = process.env.SERPAPI_KEY || "";
const ENABLED = Boolean(KEY);
const TOLERANCE = 1.10; // le prix vu doit être ≤ 110 % du prix annoncé

// Nom d'appareil Google → code court (FLAT_AIRCRAFT de _charte.js, ACN du site)
function aircraftCode(name) {
  const n = String(name || "");
  if (!n) return "";
  if (/787/.test(n)) return "787";
  if (/777/.test(n)) return "777";
  if (/A350/i.test(n)) return "350";
  if (/A380/i.test(n)) return "380";
  if (/A340/i.test(n)) return "343";
  if (/A330/i.test(n)) return "330";
  if (/747/.test(n)) return "747";
  if (/767/.test(n)) return "763";
  if (/A321.*neo|A321LR|A321XLR/i.test(n)) return "32Q";
  if (/A321/i.test(n)) return "321";
  if (/A320.*neo/i.test(n)) return "32N";
  if (/A320/i.test(n)) return "320";
  if (/A319/i.test(n)) return "319";
  if (/A220/i.test(n)) return "223";
  if (/737 MAX 8/i.test(n)) return "7M8";
  if (/737 MAX 9/i.test(n)) return "7M9";
  if (/737/.test(n)) return "738";
  if (/Embraer 19|E19/i.test(n)) return "E90";
  if (/CRJ/i.test(n)) return "CRJ";
  return n.replace(/[^A-Z0-9]/gi, "").slice(0, 3).toUpperCase() || "";
}

function carrierOf(flightNumber) {
  const m = /^([A-Z0-9]{2})\s/.exec(String(flightNumber || "").toUpperCase());
  return m ? m[1] : null;
}

function isoDuration(minutes) {
  const m = Number(minutes) || 0;
  return "PT" + Math.floor(m / 60) + "H" + (m % 60) + "M";
}

// Interroge Google Flights pour une paire de dates. Même forme de réponse que _amadeus.js :
//   { ok:true, price, carrier, carriers, segments:[{from,to,carrier,flight,aircraft,duration,dep,arr}], stops, allBusiness, offers }
//   { ok:false, error, status }
// Google Flights veut des codes d'AÉROPORT (ou plusieurs, séparés par des virgules) : un code de ville
// Aviasales comme PAR, LON ou BJS ne lui dit rien et il répond « no results ». On traduit donc les
// villes multi-aéroports du cache en liste d'aéroports ; les autres codes passent tels quels.
const AIRPORTS_OF = {
  PAR: "CDG,ORY", LON: "LHR,LGW,LCY,STN", NYC: "JFK,EWR", TYO: "HND,NRT", OSA: "KIX,ITM", MIL: "MXP,LIN", ROM: "FCO",
  SEL: "ICN", SHA: "PVG,SHA", BJS: "PEK,PKX", SAO: "GRU", RIO: "GIG", BUE: "EZE", STO: "ARN", YTO: "YYZ", CHI: "ORD",
  WAS: "IAD,DCA", BKK: "BKK,DMK", MOW: "SVO,DME", JKT: "CGK", IST: "IST,SAW", MEX: "MEX", DXB: "DXB,DWC", TPE: "TPE", BER: "BER"
};
function airports(code) { const c = String(code || "").toUpperCase(); return AIRPORTS_OF[c] || c; }

async function search(from, to, dep, ret, opts) {
  const o = opts || {};
  const params = new URLSearchParams({
    engine: "google_flights", api_key: KEY,
    departure_id: airports(from), arrival_id: airports(to), outbound_date: dep,
    type: ret ? "1" : "2", travel_class: "3", adults: "1",
    currency: "EUR", hl: "fr", gl: "fr"
  });
  if (ret) params.set("return_date", ret);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeout || 20000);
  try {
    const resp = await fetch("https://serpapi.com/search.json?" + params.toString(), { signal: ctrl.signal });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, error: "SerpApi HTTP " + resp.status + " " + body.slice(0, 200) };
    }
    const json = await resp.json();
    if (json.error) return { ok: false, status: 200, error: "SerpApi : " + json.error };
    const raw = [].concat(json.best_flights || [], json.other_flights || []);
    const offers = raw.map(parseOffer).filter(Boolean).sort((a, b) => a.price - b.price);
    if (!offers.length) return { ok: true, price: null, offers: [], carrier: null, carriers: [], segments: [], stops: null };
    return Object.assign({ ok: true, offers }, offers[0]);
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

function parseOffer(x) {
  if (!x || !(x.price > 0) || !Array.isArray(x.flights) || !x.flights.length) return null;
  const segments = x.flights.map(f => ({
    from: f.departure_airport && f.departure_airport.id, to: f.arrival_airport && f.arrival_airport.id,
    carrier: carrierOf(f.flight_number), flight: f.flight_number || null,
    aircraft: aircraftCode(f.airplane), aircraftName: f.airplane || null,
    duration: isoDuration(f.duration), dep: f.departure_airport && f.departure_airport.time, arr: f.arrival_airport && f.arrival_airport.time,
    cabin: f.travel_class || null
  }));
  const carriers = [...new Set(segments.map(s => s.carrier).filter(Boolean))];
  // Google ne détaille que l'aller ici ; le prix est celui de l'aller-retour complet.
  return {
    price: Math.round(x.price),
    carrier: segments[0].carrier,
    carriers,
    segments,
    stops: Math.max(0, segments.length - 1),
    allBusiness: segments.every(s => !s.cabin || /business|first|affaires|premi[eè]re/i.test(s.cabin)),
    seats: null
  };
}

module.exports = { ENABLED, TOLERANCE, search, aircraftCode, airports, AIRPORTS_OF };
