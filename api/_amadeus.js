// ============================================================
// AERYNDO — vérification en temps réel via Amadeus (clients Enterprise)
// NB : le portail Self-Service gratuit a fermé le 17 juillet 2026 ; ce module ne
// sert que si un contrat Enterprise fournit des clés. Sinon, voir _google.js.
//
// Un candidat trouvé dans le cache Travelpayouts n'est publié que si
// Amadeus confirme, à l'instant, un tarif Business aller-retour au plus
// TOLERANCE au-dessus. La réponse donne aussi la compagnie, l'appareil et
// les escales : c'est ce qui permet de dire en clair « lit à plat » ou non.
//
// Variables Vercel :
//   AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET   (portail Enterprise Amadeus)
//   AMADEUS_ENV = test | production            (test par défaut)
// Zéro dépendance npm : fetch natif.
// ============================================================

const ID = process.env.AMADEUS_CLIENT_ID || "";
const SECRET = process.env.AMADEUS_CLIENT_SECRET || "";
const BASE = (process.env.AMADEUS_ENV || "test").toLowerCase() === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";
const ENABLED = Boolean(ID && SECRET);
const TOLERANCE = 1.10; // le prix vu doit être ≤ 110 % du prix annoncé

let tokenCache = { value: null, exp: 0 };

async function token() {
  if (tokenCache.value && tokenCache.exp > Date.now() + 30000) return tokenCache.value;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: ID, client_secret: SECRET });
  const resp = await fetch(BASE + "/v1/security/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString()
  });
  if (!resp.ok) throw new Error("Amadeus auth HTTP " + resp.status);
  const json = await resp.json();
  tokenCache = { value: json.access_token, exp: Date.now() + (Number(json.expires_in || 1799) * 1000) };
  return tokenCache.value;
}

// Interroge Amadeus pour une paire de dates. Retourne :
//   { ok:true, price, carrier, carriers, segments:[{from,to,carrier,flight,aircraft,duration,dep,arr}], stops, offers }
//   { ok:false, error, status }
async function search(from, to, dep, ret, opts) {
  const o = opts || {};
  const tk = await token();
  const params = new URLSearchParams({
    originLocationCode: from, destinationLocationCode: to,
    departureDate: dep, adults: "1", travelClass: "BUSINESS", currencyCode: "EUR",
    max: String(o.max || 10)
  });
  if (ret) params.set("returnDate", ret);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.timeout || 12000);
  try {
    const resp = await fetch(BASE + "/v2/shopping/flight-offers?" + params.toString(), {
      headers: { Authorization: "Bearer " + tk, Accept: "application/json" }, signal: ctrl.signal
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, error: "Amadeus HTTP " + resp.status + " " + body.slice(0, 200) };
    }
    const json = await resp.json();
    const offers = (json.data || []).map(parseOffer).filter(Boolean).sort((a, b) => a.price - b.price);
    if (!offers.length) return { ok: true, price: null, offers: [], carrier: null, carriers: [], segments: [], stops: null };
    const best = offers[0];
    return Object.assign({ ok: true, offers }, best);
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

function parseOffer(x) {
  if (!x || !x.price || !x.itineraries) return null;
  const price = Number(x.price.grandTotal || x.price.total);
  if (!(price > 0)) return null;
  const segments = [];
  for (const it of x.itineraries) for (const s of (it.segments || [])) {
    segments.push({
      from: s.departure && s.departure.iataCode, to: s.arrival && s.arrival.iataCode,
      carrier: s.carrierCode, flight: s.carrierCode + (s.number || ""),
      aircraft: s.aircraft && s.aircraft.code, duration: s.duration,
      dep: s.departure && s.departure.at, arr: s.arrival && s.arrival.at
    });
  }
  // cabine réellement tarifée sur chaque tronçon (Amadeus peut mixer en cas de rupture)
  const cabins = [];
  for (const tp of (x.travelerPricings || [])) for (const fd of (tp.fareDetailsBySegment || [])) cabins.push(fd.cabin);
  const outbound = (x.itineraries[0] && x.itineraries[0].segments) || [];
  const carriers = [...new Set(segments.map(s => s.carrier).filter(Boolean))];
  return {
    price: Math.round(price),
    carrier: (x.validatingAirlineCodes && x.validatingAirlineCodes[0]) || (outbound[0] && outbound[0].carrierCode) || null,
    carriers,
    segments,
    stops: Math.max(0, outbound.length - 1),
    allBusiness: cabins.length ? cabins.every(c => c === "BUSINESS" || c === "FIRST") : true,
    seats: x.numberOfBookableSeats || null
  };
}

module.exports = { ENABLED, BASE, TOLERANCE, search, token };
