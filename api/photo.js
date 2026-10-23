// ============================================================
// /api/photo — une photo de destination par ville, via Pixabay
//
// GET /api/photo?city=MLE          → l'image elle-même (JPEG), mise en cache CDN 30 jours
// GET /api/photo?city=MLE&info=1   → { ok, city, url, credit } (pour le robot Instagram)
//
// Pixabay demande de ne pas « hotlinker » durablement ses images : on les sert donc
// depuis aeryndo.co (ce fichier). IMPORTANT (constaté le 16 et le 18 oct. 2026) : les adresses
// d'image Pixabay sont TEMPORAIRES (elles expirent après ~24 h) → on mémorise l'IDENTIFIANT de la
// photo choisie (30 jours, Upstash), et on redemande une adresse fraîche à Pixabay (par id) quand
// la précédente a plus de 12 h ou ne répond plus. Si l'image a disparu de Pixabay, on en choisit une autre.
// Variable Vercel : PIXABAY_API_KEY. Sans clé : redirection vers une photo de cabine.
// Zéro dépendance npm : fetch natif.
// ============================================================
const S = require("./_store.js");

const KEY = process.env.PIXABAY_API_KEY || "";
const TTL = 30 * 24 * 3600;          // mémoire du choix (identifiant de la photo)
const URL_FRESH_MS = 12 * 3600 * 1000; // au-delà, on redemande l'adresse à Pixabay avant de servir

// Mots-clés de recherche (en anglais : Pixabay indexe mieux) par code de ville Aviasales.
const QUERY = {
  NYC: "new york skyline manhattan", LAX: "los angeles palm trees", SFO: "san francisco golden gate", MIA: "miami beach",
  CHI: "chicago skyline", BOS: "boston skyline", WAS: "washington dc capitol", YTO: "toronto skyline", YUL: "montreal city",
  MEX: "mexico city", SAO: "sao paulo skyline", RIO: "rio de janeiro sugarloaf", BUE: "buenos aires", LIM: "lima peru coast", BOG: "bogota colombia",
  LON: "london big ben", PAR: "paris eiffel tower", ROM: "rome colosseum", MIL: "milan duomo", MAD: "madrid gran via", BCN: "barcelona sagrada familia",
  LIS: "lisbon tram", ATH: "athens acropolis", IST: "istanbul bosphorus mosque", AMS: "amsterdam canal", BRU: "brussels grand place",
  FRA: "frankfurt skyline", MUC: "munich city", BER: "berlin brandenburg gate", ZRH: "zurich lake", GVA: "geneva lake jet d'eau", VIE: "vienna opera",
  CPH: "copenhagen nyhavn", STO: "stockholm old town", OSL: "oslo fjord", HEL: "helsinki cathedral", WAW: "warsaw old town", PRG: "prague charles bridge", BUD: "budapest parliament",
  NCE: "nice french riviera", LYS: "lyon city", DUB: "dublin city", MAN: "manchester city", LUX: "luxembourg city", DUS: "dusseldorf rhine",
  DXB: "dubai skyline burj", DOH: "doha skyline", AUH: "abu dhabi mosque", MCT: "muscat oman", CAI: "cairo pyramids", TLV: "tel aviv beach", RUH: "riyadh skyline", JED: "jeddah corniche",
  JNB: "johannesburg skyline", CPT: "cape town table mountain", NBO: "nairobi safari", MRU: "mauritius beach lagoon", SEZ: "seychelles beach granite", ADD: "ethiopia highlands", DSS: "dakar senegal coast", CMN: "casablanca mosque hassan",
  DEL: "delhi india gate", BOM: "mumbai gateway of india", MLE: "maldives beach aerial", CMB: "sri lanka beach", BKK: "bangkok temple", HKT: "phuket beach", SIN: "singapore marina bay",
  KUL: "kuala lumpur petronas", DPS: "bali rice terrace", CGK: "jakarta skyline", JKT: "jakarta skyline", MNL: "manila bay", SGN: "ho chi minh city", HAN: "hanoi old quarter",
  HKG: "hong kong skyline victoria harbour", TPE: "taipei 101", TYO: "tokyo shibuya night", OSA: "osaka castle", SEL: "seoul palace", SHA: "shanghai bund", BJS: "beijing forbidden city", CAN: "guangzhou tower",
  SYD: "sydney opera house", MEL: "melbourne skyline", AKL: "auckland harbour", CUN: "cancun beach caribbean", HAV: "havana old cars", PUJ: "punta cana beach",
  ZNZ: "zanzibar beach", KTM: "kathmandu temple", HNL: "honolulu beach", LAS: "las vegas strip night", SCL: "santiago chile andes", MVD: "montevideo"
};
const FALLBACK = "https://images.unsplash.com/photo-1718948740023-ebb6e6f9cf6e?w=1200&q=70&auto=format&fit=crop";

async function pixabay(params) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch("https://pixabay.com/api/?" + new URLSearchParams(Object.assign({ key: KEY }, params)).toString(), { signal: ctrl.signal });
    if (!resp.ok) return null;
    const json = await resp.json();
    return (json.hits || []).find(h => h.largeImageURL) || null;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}
const fromHit = (hit, q) => ({ id: hit.id, url: hit.largeImageURL, preview: hit.webformatURL, credit: hit.user, page: hit.pageURL, q, at: new Date().toISOString(), urlAt: Date.now() });

async function search(city) {
  const q = QUERY[city] || (city + " city travel");
  const hit = await pixabay({ q, image_type: "photo", orientation: "horizontal", category: "travel", min_width: "1280", safesearch: "true", order: "popular", per_page: "10" });
  if (!hit) return null;
  const chosen = fromHit(hit, q);
  await S.set("photo:" + city, chosen, TTL);
  return chosen;
}

// Adresse fraîche pour une photo déjà choisie (par identifiant) ; nouvelle recherche si elle a disparu.
async function refresh(city, cached) {
  const hit = cached && cached.id ? await pixabay({ id: String(cached.id) }) : null;
  if (hit) { const fresh = Object.assign({}, cached, fromHit(hit, cached.q)); await S.set("photo:" + city, fresh, TTL); return fresh; }
  return search(city);
}

async function pick(city, force) {
  if (!KEY) return null;
  const cached = await S.get("photo:" + city);
  if (!cached || !cached.id) return search(city);                       // ancien format (adresse seule) ou rien : on (re)choisit
  if (!force && cached.url && cached.urlAt && Date.now() - cached.urlAt < URL_FRESH_MS) return cached;
  return (await refresh(city, cached)) || cached;
}

async function fetchImage(url) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const img = await fetch(url, { signal: ctrl.signal });
    if (!img.ok) return null;
    return { buf: Buffer.from(await img.arrayBuffer()), type: img.headers.get("content-type") || "image/jpeg" };
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const city = String(q.city || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!city) { res.statusCode = 400; return res.end("city?"); }

  let chosen = null;
  try { chosen = await pick(city, q.fresh === "1"); } catch (e) { chosen = null; }

  if (q.info === "1") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ ok: Boolean(chosen), city, url: chosen ? chosen.url : null, id: chosen ? chosen.id : null, credit: chosen ? chosen.credit : null, source: chosen ? "pixabay" : "fallback" }));
  }

  if (!chosen) { res.statusCode = 302; res.setHeader("Location", FALLBACK); res.setHeader("Cache-Control", "public, s-maxage=3600"); return res.end(); }

  // L'image elle-même ; si l'adresse a expiré entre-temps, on en redemande une et on réessaie une fois.
  let img = await fetchImage(chosen.url);
  if (!img) {
    try { chosen = (await refresh(city, chosen)) || chosen; } catch (e) { /* on garde */ }
    img = chosen && chosen.url ? await fetchImage(chosen.url) : null;
  }
  if (!img) { res.statusCode = 302; res.setHeader("Location", FALLBACK); res.setHeader("Cache-Control", "no-store"); return res.end(); }

  res.statusCode = 200;
  res.setHeader("Content-Type", img.type);
  res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=2592000, max-age=86400");
  res.setHeader("X-Photo-Credit", "Pixabay / " + String(chosen.credit || "").replace(/[^\w .-]/g, ""));
  return res.end(img.buf);
};
