// ============================================================
// AERYNDO — les promotions officielles des compagnies (v9, 4 nov. 2026)
//
// Troisième œil du robot, à côté du cache Travelpayouts et de la veille des sites de deals :
// une fois par jour, le robot lit les pages « offres » des compagnies qui vendent le plus de
// Business au départ d'Europe (Qatar, Emirates, Etihad, Turkish, Air France, KLM, Cathay,
// Singapore). Chaque ligne de page qui cite une destination connue, un prix et la cabine
// Business devient un candidat {origins, to, price, deadline} — vérifié ensuite sur Google
// Flights par scan.js comme n'importe quel autre candidat. Rien n'est publié sur la foi
// d'une page compagnie.
//
// Les pages sont rendues côté serveur à des degrés divers : une page vide ou illisible donne
// simplement 0 candidat (visible dans /api/veille?promos=1). Zéro dépendance npm.
// ============================================================
const S = require("./_store.js");
const VE = require("./_veille.js");

const UA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 AeryndoBot/1.0";
const MIN_PRICE = 700;   // en dessous, ce n'est pas un aller-retour Business long-courrier
const MAX_AGE_MS = 20 * 3600 * 1000;

const PAGES = [
  { id: "qatar-fr", name: "Qatar Airways", carrier: "QR", origins: ["PAR", "NCE"], url: "https://www.qatarairways.com/fr-fr/offers.html" },
  { id: "emirates-fr", name: "Emirates", carrier: "EK", origins: ["PAR", "NCE", "LYS"], url: "https://www.emirates.com/fr/french/special-offers/" },
  { id: "etihad-fr", name: "Etihad", carrier: "EY", origins: ["PAR", "GVA"], url: "https://www.etihad.com/fr-fr/offers" },
  { id: "turkish-fr", name: "Turkish Airlines", carrier: "TK", origins: ["PAR", "NCE", "LYS", "GVA", "BRU"], url: "https://www.turkishairlines.com/fr-fr/promotions/" },
  { id: "airfrance-fr", name: "Air France", carrier: "AF", origins: ["PAR"], url: "https://wwws.airfrance.fr/offres/vols-promotions" },
  { id: "klm-fr", name: "KLM", carrier: "KL", origins: ["PAR", "NCE", "LYS", "BRU"], url: "https://www.klm.fr/offers" },
  { id: "cathay-fr", name: "Cathay Pacific", carrier: "CX", origins: ["PAR"], url: "https://www.cathaypacific.com/cx/fr_FR/offers.html" },
  { id: "singapore-fr", name: "Singapore Airlines", carrier: "SQ", origins: ["PAR"], url: "https://www.singaporeair.com/fr_FR/fr/special-offers/flight-from-paris/" }
];

// Destinations reconnues dans le texte d'une page (FR + EN), → code de ville Aviasales.
const CITIES = {
  bangkok: "BKK", phuket: "HKT", singapour: "SIN", singapore: "SIN", tokyo: "TYO", osaka: "OSA", "séoul": "SEL", seoul: "SEL",
  "hong kong": "HKG", shanghai: "SHA", "pékin": "BJS", beijing: "BJS", taipei: "TPE", "kuala lumpur": "KUL", manille: "MNL", manila: "MNL",
  "hanoï": "HAN", hanoi: "HAN", "hô chi minh": "SGN", "ho chi minh": "SGN", saigon: "SGN", bali: "DPS", denpasar: "DPS", jakarta: "CGK",
  "dubaï": "DXB", dubai: "DXB", doha: "DOH", "abou dhabi": "AUH", "abu dhabi": "AUH", mascate: "MCT", muscat: "MCT", "le caire": "CAI", cairo: "CAI",
  "tel aviv": "TLV", riyad: "RUH", riyadh: "RUH", djeddah: "JED", jeddah: "JED", amman: "AMM", istanbul: "IST",
  maldives: "MLE", "malé": "MLE", male: "MLE", maurice: "MRU", mauritius: "MRU", seychelles: "SEZ", "mahé": "SEZ", colombo: "CMB",
  "new delhi": "DEL", delhi: "DEL", mumbai: "BOM", bombay: "BOM", bangalore: "BLR", bengaluru: "BLR", chennai: "MAA", "katmandou": "KTM", kathmandu: "KTM",
  johannesburg: "JNB", "le cap": "CPT", "cape town": "CPT", nairobi: "NBO", zanzibar: "ZNZ", "addis-abeba": "ADD", "addis ababa": "ADD",
  dakar: "DSS", casablanca: "CMN", marrakech: "RAK", abidjan: "ABJ", lagos: "LOS", accra: "ACC", "la réunion": "RUN", "saint-denis": "RUN", antananarivo: "TNR",
  "new york": "NYC", "los angeles": "LAX", "san francisco": "SFO", miami: "MIA", chicago: "CHI", boston: "BOS", washington: "WAS", "las vegas": "LAS",
  toronto: "YTO", "montréal": "YUL", montreal: "YUL", vancouver: "YVR", mexico: "MEX", "cancún": "CUN", cancun: "CUN", "la havane": "HAV", havana: "HAV",
  "punta cana": "PUJ", "rio de janeiro": "RIO", rio: "RIO", "são paulo": "SAO", "sao paulo": "SAO", "buenos aires": "BUE", lima: "LIM", "bogotá": "BOG", bogota: "BOG", santiago: "SCL",
  sydney: "SYD", melbourne: "MEL", perth: "PER", brisbane: "BNE", auckland: "AKL", "papeete": "PPT", "nouméa": "NOU"
};
const CITY_RE = new RegExp("(?<![\\p{L}])(" + Object.keys(CITIES).sort((a, b) => b.length - a.length).map(k => k.replace(/[-\s]/g, "[-\\s]")).join("|") + ")(?![\\p{L}])", "iu");
const CABIN_RE = /\b(business|affaires)\b/i;
const EXCLUDE_RE = /premium\s*(economy|eco|comfort|économique)|\beco(nomy|nomique|nómica)?\b|miles?\b|points?\b|flying\s*blue|privilege\s*club|skywards|miles\s*&\s*smiles|upgrade|surclassement|hôtel|hotel|voiture|car\s+rental|one[-\s]?way|aller\s+simple/i;

async function get(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 16000); // pages lourdes : 16 s (lecture quotidienne, en parallèle)
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6" }, signal: ctrl.signal, redirect: "follow" });
    if (!resp.ok) return { html: null, status: resp.status };
    return { html: await resp.text(), status: resp.status };
  } catch (e) { return { html: null, status: 0, error: String(e && e.message || e) }; }
  finally { clearTimeout(t); }
}

// Texte brut de la page → lignes ; les scripts/styles sont retirés avant.
function lines(html) {
  const txt = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d|div|tr|td|span|a|section|article|button)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#8364;|&euro;/g, "€").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
  return txt.split(/\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(l => l.length > 3 && l.length < 400);
}

// Une page → candidats. La cabine peut être nommée sur la ligne elle-même ou dans les 4 lignes qui précèdent
// (titre de section « Offres Business », puis une carte par destination).
function extract(page, html) {
  const out = []; const seen = new Set();
  const L = lines(html);
  for (let i = 0; i < L.length; i++) {
    const line = L[i];
    const city = CITY_RE.exec(line); if (!city) continue;
    // Cabine nommée sur la ligne : le prix Business est celui qui SUIT le mot (« Economy 590 € · Business 1 890 € »).
    // Cabine nommée seulement dans les lignes précédentes : la ligne ne doit pas parler d'une autre cabine.
    const cab = CABIN_RE.exec(line);
    let price = null;
    if (cab) price = VE.parsePrice(line.slice(cab.index));
    else if (VE.parsePrice(line)) { if (EXCLUDE_RE.test(line)) continue; price = VE.parsePrice(line); }
    else {
      // Carte « Bangkok / à partir de 1 890 € » : le prix est sur l'une des 3 lignes suivantes, sans autre ville entre les deux.
      for (let j = i + 1; j <= Math.min(L.length - 1, i + 3) && !price; j++) {
        if (CITY_RE.test(L[j])) break;
        if (EXCLUDE_RE.test(L[j]) && !CABIN_RE.test(L[j])) break;
        const c2 = CABIN_RE.exec(L[j]);
        price = VE.parsePrice(c2 ? L[j].slice(c2.index) : L[j]);
      }
    }
    if (!price || price.price < MIN_PRICE) continue;
    const context = L.slice(Math.max(0, i - 6), Math.min(L.length, i + 4)).join(" | ");
    if (!CABIN_RE.test(context)) continue;
    const to = CITIES[city[1].toLowerCase().replace(/\s+/g, " ")];
    if (!to || seen.has(to)) continue;
    seen.add(to);
    out.push({
      guid: page.id + ":" + to + ":" + price.price, link: page.url, src: page.id, srcName: page.name, title: line.slice(0, 120), pub: new Date().toISOString(),
      origins: page.origins, to, price: price.price, currency: price.currency, carrier: page.carrier,
      deadline: VE.parseDeadline(context, Date.now()), period: VE.parsePeriod(context, Date.now()), generic: page.origins.length > 1
    });
  }
  return out;
}

// Relit les pages au plus une fois par jour ; retourne { at, sources, candidates }.
async function refresh(force) {
  const last = await S.get("promos:last");
  if (!force && last && Date.now() - Date.parse(last.at) < MAX_AGE_MS) return last;
  const out = { at: new Date().toISOString(), sources: {}, candidates: [] };
  const reads = await Promise.all(PAGES.map(async p => { const r = await get(p.url); return { p, r }; }));
  for (const { p, r } of reads) {
    if (!r.html) { out.sources[p.id] = "HTTP " + r.status + (r.error ? " " + r.error.slice(0, 40) : ""); continue; }
    const c = extract(p, r.html);
    out.sources[p.id] = c.length + " / " + Math.round(r.html.length / 1024) + " Ko";
    out.candidates.push(...c);
  }
  out.candidates = out.candidates.filter(c => !c.deadline || c.deadline >= new Date().toISOString().slice(0, 10)).slice(0, 40);
  await S.set("promos:last", out, 48 * 3600);
  return out;
}

module.exports = { PAGES, CITIES, refresh, extract, lines };
