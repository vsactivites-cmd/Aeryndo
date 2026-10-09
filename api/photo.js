// ============================================================
// /api/photo — une photo de destination par ville, via Pixabay
//
// GET /api/photo?city=MLE          → l'image elle-même (JPEG), mise en cache CDN 30 jours
// GET /api/photo?city=MLE&info=1   → { ok, city, url, credit } (pour le robot Instagram)
//
// Pixabay demande de ne pas « hotlinker » durablement ses images : on les sert donc
// depuis aeryndo.co (ce fichier), et le choix de la photo est mémorisé 30 jours
// dans la mémoire du robot (Upstash) pour ne pas interroger Pixabay à chaque visite.
// Variable Vercel : PIXABAY_API_KEY. Sans clé : redirection vers une photo de cabine
// (le site reste identique à aujourd'hui).
// Zéro dépendance npm : fetch natif.
// ============================================================
const S = require("./_store.js");

const KEY = process.env.PIXABAY_API_KEY || "";
const TTL = 30 * 24 * 3600;

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
  KUL: "kuala lumpur petronas", DPS: "bali rice terrace", CGK: "jakarta skyline", MNL: "manila bay", SGN: "ho chi minh city", HAN: "hanoi old quarter",
  HKG: "hong kong skyline victoria harbour", TPE: "taipei 101", TYO: "tokyo shibuya night", OSA: "osaka castle", SEL: "seoul palace", SHA: "shanghai bund", BJS: "beijing forbidden city", CAN: "guangzhou tower",
  SYD: "sydney opera house", MEL: "melbourne skyline", AKL: "auckland harbour"
};
const FALLBACK = "https://images.unsplash.com/photo-1718948740023-ebb6e6f9cf6e?w=1200&q=70&auto=format&fit=crop";

async function pick(city) {
  const cached = await S.get("photo:" + city);
  if (cached && cached.url) return cached;
  if (!KEY) return null;
  const q = QUERY[city] || (city + " city travel");
  const params = new URLSearchParams({ key: KEY, q, image_type: "photo", orientation: "horizontal", category: "travel", min_width: "1280", safesearch: "true", order: "popular", per_page: "10" });
  const resp = await fetch("https://pixabay.com/api/?" + params.toString());
  if (!resp.ok) return null;
  const json = await resp.json();
  const hit = (json.hits || []).find(h => h.largeImageURL) || null;
  if (!hit) return null;
  const chosen = { url: hit.largeImageURL, preview: hit.webformatURL, credit: hit.user, page: hit.pageURL, q, at: new Date().toISOString() };
  await S.set("photo:" + city, chosen, TTL);
  return chosen;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const city = String(q.city || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!city) { res.statusCode = 400; return res.end("city?"); }

  let chosen = null;
  try { chosen = await pick(city); } catch (e) { chosen = null; }

  if (q.info === "1") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.end(JSON.stringify({ ok: Boolean(chosen), city, url: chosen ? chosen.url : null, credit: chosen ? chosen.credit : null, source: chosen ? "pixabay" : "fallback" }));
  }

  if (!chosen) { res.statusCode = 302; res.setHeader("Location", FALLBACK); res.setHeader("Cache-Control", "public, s-maxage=3600"); return res.end(); }

  try {
    const img = await fetch(chosen.url);
    if (!img.ok) throw new Error("pixabay HTTP " + img.status);
    const buf = Buffer.from(await img.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", img.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=2592000, max-age=86400");
    res.setHeader("X-Photo-Credit", "Pixabay / " + String(chosen.credit || "").replace(/[^\w .-]/g, ""));
    return res.end(buf);
  } catch (e) {
    res.statusCode = 302; res.setHeader("Location", chosen.url); return res.end();
  }
};
