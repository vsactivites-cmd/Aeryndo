// ============================================================
// AERYNDO — la veille : le robot lit les sites de deals, en continu
//
// Deuxième œil du robot, à côté du cache Travelpayouts. Les flux RSS et pages
// des sites spécialisés sont lus toutes les 30 minutes ; chaque annonce de
// tarif Business/First au départ d'Europe est transformée en candidat
// (origine, destination, prix annoncé, période, date limite) puis VÉRIFIÉE sur
// Google Flights par scan.js, exactement comme un candidat du cache. Rien n'est
// publié sur la foi d'un site tiers : seule la vérification en direct compte.
//
// Sources vérifiées le 9 octobre 2026 (voir le doc du projet « chasse-03 »).
// Les sites qui réservent leurs deals Business aux abonnés (Secret Flying) ou
// qui rendent leurs pages en JavaScript (Reisetopia) ne sont pas lisibles.
// Zéro dépendance npm : fetch natif + expressions régulières.
// ============================================================
const S = require("./_store.js");

const UA = "AeryndoBot/1.0 (+https://aeryndo.co ; veille deals Business)";
const SOURCES = [
  { id: "travel-dealz-en", name: "Travel-Dealz", lang: "en", kind: "rss", url: "https://travel-dealz.com/category/flights/business-class/feed/", business: true },
  { id: "travel-dealz-first", name: "Travel-Dealz", lang: "en", kind: "rss", url: "https://travel-dealz.com/category/flights/first-class/feed/", business: true },
  { id: "travel-dealz-de", name: "Travel-Dealz.de", lang: "de", kind: "rss", url: "https://travel-dealz.de/kategorie/fluge/business-class/feed/", business: true },
  { id: "fly4free-biz", name: "Fly4free", lang: "en", kind: "rss", url: "https://www.fly4free.com/flight-deals/business-class/feed/", business: true },
  { id: "premium-flights", name: "Premium Flights", lang: "en", kind: "rss", url: "https://premium-flights.com/category/cheap-business-class-flights/business-class-deals-from-europe/feed/", business: true,
    fallback: "https://premium-flights.com/category/cheap-business-class-flights/business-class-deals-from-europe/" },
  { id: "travel-dealz-all", name: "Travel-Dealz", lang: "en", kind: "rss", url: "https://travel-dealz.com/deal/feed/", business: false },
  { id: "dealabs-vols", name: "Dealabs", lang: "fr", kind: "rss", url: "https://www.dealabs.com/rss/groupe/billets-d-avion", business: false },
  { id: "mydealz-fluege", name: "mydealz", lang: "de", kind: "rss", url: "https://www.mydealz.de/rss/gruppe/fluege", business: false },
  { id: "frankfurtflyer", name: "Frankfurtflyer", lang: "de", kind: "rss", url: "https://frankfurtflyer.de/tag/business-class/feed/", business: true }
];

// ---------- lecture ----------
async function get(url, accept) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": accept || "application/rss+xml, application/xml, text/html;q=0.8", "Accept-Encoding": "identity" }, signal: ctrl.signal, redirect: "follow" });
      if (resp.ok) return await resp.text();
      if (resp.status < 500) return null;
    } catch (e) { /* retry */ } finally { clearTimeout(t); }
    await new Promise(r => setTimeout(r, 800));
  }
  return null;
}

function unescapeXml(x) {
  return String(x || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—").replace(/&#8594;|&rarr;/g, "→").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&euro;/g, "€").replace(/&pound;/g, "£");
}
function stripTags(h) { return unescapeXml(String(h || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d|div|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim(); }
function tag(block, name) { const m = new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i").exec(block); return m ? m[1] : ""; }

function parseRss(xml, src) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi; let m;
  while ((m = re.exec(xml)) && items.length < 40) {
    const b = m[1];
    const title = stripTags(tag(b, "title"));
    const link = unescapeXml(tag(b, "link") || (/<link[^>]*href="([^"]+)"/.exec(b) || [])[1] || "").trim().replace(/[?&]utm_[^&]+/g, "").replace(/\?$/, "");
    const guid = unescapeXml(tag(b, "guid")).trim() || link;
    const pub = Date.parse(tag(b, "pubDate") || tag(b, "dc:date") || "") || null;
    const body = stripTags(tag(b, "content:encoded") || tag(b, "description"));
    const cats = []; const cre = /<category[^>]*>([\s\S]*?)<\/category>/gi; let c; while ((c = cre.exec(b))) cats.push(stripTags(c[1]));
    if (title) items.push({ src: src.id, srcName: src.name, lang: src.lang, title, link, guid, pub, body: body.slice(0, 6000), cats });
  }
  return items;
}
// Page catégorie WordPress (repli si le flux ne répond pas) : titres + liens + dates.
function parseHtmlList(html, src) {
  const items = []; const seen = new Set();
  const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{25,160})<\/a>/gi; let m;
  while ((m = re.exec(html)) && items.length < 40) {
    const link = m[1].replace(/[?&]utm_[^&]+/g, ""), title = stripTags(m[2]);
    if (seen.has(link) || !/business|first/i.test(title) || /\/category\/|\/tag\/|\/page\//.test(link)) continue;
    seen.add(link);
    const after = html.slice(m.index, m.index + 1500); const d = /datetime="([^"]+)"/.exec(after);
    items.push({ src: src.id, srcName: src.name, lang: src.lang, title, link, guid: link, pub: d ? Date.parse(d[1]) : null, body: "", cats: [] });
  }
  return items;
}

async function readSource(src) {
  let xml = await get(src.url);
  let items = xml && /<item>/i.test(xml) ? parseRss(xml, src) : [];
  if (!items.length && src.fallback) { const html = await get(src.fallback, "text/html"); if (html) items = parseHtmlList(html, src); }
  return items;
}

// ---------- interprétation d'une annonce ----------
const CLASS_RE = /\b(business|first)\b|classe\s+affaires|affaires|erste\s+klasse|premi[èe]re\s+classe/i;
const EXCLUDE_RE = /one-?ways?\b|\boneway\b|aller\s+simple|\beinfache?r?\b|premium\s*(economy|eco|class)|prem\.?\s*eco|award|avios|\bmiles?\b|meilen|points?\b|punkte|promo\s*code|gutschein|coupon|cashback|hotel|credit\s*card|kreditkarte|\bexpired\b|abgelaufen|expir[ée]/i;
const NUM = "(\\d{1,3}(?:[.,\\s]\\d{3})+(?:[.,]\\d{2})?|\\d{3,5}(?:[.,]\\d{2})?)";
const PRICE_RE = new RegExp("(?:(€|eur|£|gbp|\\$|usd)\\s?" + NUM + "|" + NUM + "\\s?(€|eur|£|gbp))", "i");
const RATES = { "€": 1, EUR: 1, "£": 1.15, GBP: 1.15, "$": 0.92, USD: 0.92 };

function parsePrice(text) {
  const m = PRICE_RE.exec(text); if (!m) return null;
  const cur = (m[1] || m[4] || "€").toUpperCase(); let raw = (m[2] || m[3] || "").replace(/\s/g, "");
  // 1.522 / 1,268 = milliers ; 560,97 = décimales
  if (/^\d{1,3}[.,]\d{3}$/.test(raw)) raw = raw.replace(/[.,]/, "");
  else if (/[.,]\d{2}$/.test(raw)) raw = raw.replace(/[.,](\d{2})$/, ".$1").replace(/[.,](?=\d{3})/g, "");
  else raw = raw.replace(/[.,]/g, "");
  const n = Math.round(parseFloat(raw) * (RATES[cur] || RATES[cur.replace(/[^A-Z]/g, "")] || 1));
  return n > 150 && n < 20000 ? { price: n, currency: cur } : null;
}

// Routes dans le titre : « Paris → Maldives », « from Paris to the Maldives », « Malediven: … von Paris », « Paris (CDG) <=> Montréal (YUL) », « <Airline> Business Class to Delhi … from 13 European Countries »
const COUNTRY = { thailand: "BKK", thailande: "BKK", vietnam: "SGN", indonesia: "DPS", indonesien: "DPS", bali: "DPS", india: "DEL", indien: "DEL", inde: "DEL", japan: "TYO", japon: "TYO", china: "BJS", chine: "BJS", maldives: "MLE", malediven: "MLE", mauritius: "MRU", maurice: "MRU", "south africa": "JNB", südafrika: "JNB", usa: "NYC", "united states": "NYC", australia: "SYD", australien: "SYD", seychelles: "SEZ", seychellen: "SEZ", "sri lanka": "CMB", philippines: "MNL", philippinen: "MNL", malaysia: "KUL", singapore: "SIN", singapur: "SIN", oman: "MCT", uae: "DXB", emirates: "DXB", kenya: "NBO", kenia: "NBO", tanzania: "ZNZ", tansania: "ZNZ", zanzibar: "ZNZ", sansibar: "ZNZ", egypt: "CAI", ägypten: "CAI", egypte: "CAI", morocco: "CMN", maroc: "CMN", marokko: "CMN", brazil: "SAO", brasilien: "SAO", bresil: "SAO", argentina: "BUE", argentinien: "BUE", mexico: "MEX", mexiko: "MEX", mexique: "MEX", canada: "YTO", kanada: "YTO", korea: "SEL", "south korea": "SEL", südkorea: "SEL", taiwan: "TPE", "hong kong": "HKG", hongkong: "HKG", qatar: "DOH", katar: "DOH", bahrain: "BAH", jordan: "AMM", jordanien: "AMM", israel: "TLV", turkey: "IST", türkei: "IST", turquie: "IST", uzbekistan: "TAS", usbekistan: "TAS", nepal: "KTM", cambodia: "PNH", kambodscha: "PNH", laos: "VTE", "new zealand": "AKL", neuseeland: "AKL", colombia: "BOG", kolumbien: "BOG", peru: "LIM", chile: "SCL", cuba: "HAV", kuba: "HAV", "dominican republic": "PUJ", namibia: "WDH", senegal: "DSS", ethiopia: "ADD", äthiopien: "ADD", nigeria: "LOS", ghana: "ACC", "ivory coast": "ABJ", madagascar: "TNR", reunion: "RUN", "la réunion": "RUN" };
function firstPlace(name) {
  let n = String(name || "").replace(/\s*\(.*$/, "").split(/\s*(?:\/|&|,|\+|\bor\b|\boder\b|\bou\b)\s*/i)[0].trim();
  n = n.replace(/^(?:the|les?|la|die|der|das)\s+/i, "").replace(/\s+(?:starting|round|return|hin|retour).*$/i, "").trim();
  return n;
}
function parseRoute(title) {
  let t = title.replace(/[“”"]/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s+/g, " ").trim();
  const iata = [...t.matchAll(/\(([A-Z]{3})\)/g)].map(x => x[1]);
  if (iata.length >= 2) return { from: iata[0], to: iata[1] };
  let m;
  const r = (fromName, toName) => ({ fromName: fromName ? firstPlace(fromName) : null, toName: firstPlace(toName) });
  if ((m = /^(.+?)\s*(?:→|->|⇄|<=>|↔| – | - )\s*(.+?)\s+(?:business|first|in\s+business|en\s+classe|classe)/i.exec(t)) && !/\d/.test(m[1])) return r(m[1], m[2]);
  if ((m = /\bfrom\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+(?:from|for|at|starting|ab|in\s+business|business|round|return|€|£|\$|\d)|$)/i.exec(t)) && !/^(?:€|£|\$)?\s?\d/.test(m[1])) return r(m[1], m[2]);
  if ((m = /(?:business|first)\s+class\s+(?:flights?\s+)?to\s+(?:the\s+)?(.+?)\s+(?:starting\s+at|from|for|at|ab)\s+(?:€|£|\$)?\s?\d[\d.,]*\s*(?:€|£|\$)?(?:\s+(?:from|ab|von)\s+(.+?))?(?:\s*\(|$)/i.exec(t))) return r(m[2] || null, m[1]);
  if ((m = /^(.+?):\s*(?:€|£|\$)?\s?\d[\d.,]*\s*(?:€|£|\$)?\s+.*?(?:business|first)\s+class\s+(?:flights?\s+)?(?:from|von|ab)\s+(.+?)(?:\s*[(&,]|$)/i.exec(t))) return r(m[2], m[1]);
  if ((m = /^(.+?):\s*.*?(?:business|first)\s+class\s+(?:flights?\s+)?(?:von|from)\s+(.+?)(?:,|\s+(?:ab|from|starting|für|for)\b|\s*[(&]|$)/i.exec(t)) && !/^(?:€|£|\$)?\s?\d/.test(m[2])) return r(m[2], m[1]);
  if ((m = /^(.+?):\s*.*?(?:business|first)\s+class\s+(?:flights?\s+)?(?:for|ab|from|starting\s+at)\s+(?:€|£|\$)?\s?\d[\d.,]*\s*(?:€|£|\$)?\s+(?:r\/t\s+|round\s+trip\s+)?(?:von|from)\s+(.+?)(?:\s*[(&,]|$)/i.exec(t))) return r(m[2], m[1]);
  if ((m = /^(.+?)\s+(?:ab|from)\s+(?:€|£)?\s?\d[\d.,]*\s*€?\s+in\s+der\s+.*?business\s+class\s+von\s+(.+?)(?:\s*\(|$)/i.exec(t))) return r(m[2], m[1]);
  if ((m = /(?:nach|to)\s+(?:the\s+)?(.+?)\s+(?:von|from)\s+(.+?)(?:\s+(?:ab|from|für|for)\s|$)/i.exec(t)) && !/^(?:€|£|\$)?\s?\d/.test(m[2])) return r(m[2], m[1]);
  if ((m = /(?:business|first)\s+class\s+(?:(?:flights?|nonstop|non-stop|direct)\s+)*(?:to|nach)\s+(?:the\s+)?(.+?)(?:\s+(?:from|ab|für|for)\s+(?:€|£|\$)?\s?\d|$)/i.exec(t))) return r(null, m[1]);
  return null;
}

// Noms de lieux → codes de ville Aviasales, via l'autocomplétion Travelpayouts (sans clé), mémorisés 90 jours.
const GENERIC = /european|europe|germany|deutschland|france|italy|italia|spain|scandinavia|poland|polen|uk\b|many\s+(cities|destinations)|various|several|countries|cities|städte|länder/i;
const EUROPE_HUBS = ["PAR", "NCE", "LON", "AMS", "BRU", "FRA", "MUC", "ZRH", "VIE", "MIL", "ROM", "MAD", "BCN", "LIS", "CPH", "STO", "DUB", "WAW", "PRG", "BUD"];
async function placeCode(name) {
  const key = String(name || "").toLowerCase().replace(/\b(the|les?|la|der|die|das|von|de)\b/g, "").replace(/[^a-zà-ÿ ]/gi, "").trim();
  if (!key) return null;
  if (GENERIC.test(key)) return "EU";
  if (COUNTRY[key]) return COUNTRY[key];
  const k = "place:" + key.slice(0, 40);
  const cached = await S.get(k); if (cached) return cached === "-" ? null : cached;
  let code = null;
  for (const locale of ["en", "fr", "de"]) {
    try {
      const resp = await fetch("https://autocomplete.travelpayouts.com/places2?locale=" + locale + "&types[]=city&types[]=airport&term=" + encodeURIComponent(key), { headers: { "User-Agent": UA } });
      if (!resp.ok) continue;
      const arr = await resp.json();
      const hit = (Array.isArray(arr) ? arr : []).find(p => p.type === "city") || (Array.isArray(arr) ? arr[0] : null);
      if (hit && hit.code) { code = hit.type === "airport" && hit.city_code ? hit.city_code : hit.code; break; }
    } catch (e) { /* next locale */ }
  }
  await S.set(k, code || "-", 90 * 24 * 3600);
  return code;
}

const MONTHS = { jan: 1, janv: 1, january: 1, januar: 1, feb: 2, fév: 2, fevr: 2, february: 2, februar: 2, mar: 3, mars: 3, march: 3, märz: 3, apr: 4, avr: 4, april: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, juni: 6, jul: 7, juil: 7, july: 7, juli: 7, aug: 8, août: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, okt: 10, october: 10, oktober: 10, nov: 11, november: 11, dec: 12, déc: 12, dez: 12, december: 12, dezember: 12 };
function monthNum(w) { const k = String(w || "").toLowerCase().replace(/\.$/, ""); return MONTHS[k] || MONTHS[k.slice(0, 3)] || null; }
// Date limite d'émission : « expire on December 20, 2026 », « book by 31 October », « TICKETS MUST BE ISSUED ON/BEFORE 31OCT 26 », « Buchung bis 31. Oktober »
function parseDeadline(text, pub) {
  const y0 = new Date(pub || Date.now()).getFullYear();
  let m;
  if ((m = /ISSUED\s+ON\/?BEFORE\s+(\d{1,2})([A-Z]{3})\s?(\d{2,4})/i.exec(text))) { const mo = monthNum(m[2]); if (mo) return iso(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), mo, Number(m[1])); }
  if ((m = /(?:expires?\s+on|book(?:ing)?\s+(?:by|until|before)|buchung\s+bis|buchbar\s+bis|gültig\s+bis|jusqu['’]au|avant\s+le)\s+(?:the\s+)?(\d{1,2})?(?:st|nd|rd|th|\.)?\s*(?:of\s+)?([\p{L}]+)\.?\s*(\d{1,2})?(?:,?\s*(\d{4}))?/iu.exec(text))) {
    const mo = monthNum(m[2]); const day = Number(m[1] || m[3] || 28); if (mo) { let y = Number(m[4] || y0); if (!m[4] && mo < new Date(pub || Date.now()).getMonth() + 1) y += 1; return iso(y, mo, day); }
  }
  return null;
}
// Période de voyage : mois cités après « travel dates / departures / Reisezeitraum / between … and … » → premier mois + dernier mois
function parsePeriod(text, pub) {
  const seg = (/(travel\s+dates?|departures?|valid\s+(?:for\s+)?travel|reisezeitraum|abflüge|période|voyage|available|dates?\s*:)([^.\n;]{0,220})/i.exec(text) || [])[2] || text.split(/[.\n;]/)[0].slice(0, 300);
  const y0 = new Date(pub || Date.now()).getFullYear();
  const found = []; const re = /(?<![\p{L}])([\p{L}]{3,9})\.?\s*(20\d{2})?(?![\p{L}])/gu; let m;
  while ((m = re.exec(seg))) { const mo = monthNum(m[1]); if (mo) found.push({ mo, y: m[2] ? Number(m[2]) : null }); }
  if (!found.length) return null;
  const first = found[0], last = found[found.length - 1];
  if (found.length === 1 && /\b(until|through|bis|jusqu)/iu.test(seg)) { // « until March 2027 » = d'aujourd'hui à mars 2027
    const ly = first.y || (first.mo < new Date(pub || Date.now()).getMonth() + 1 ? y0 + 1 : y0);
    return { start: new Date().toISOString().slice(0, 10), end: iso(ly, first.mo, 28) };
  }
  const fy = first.y || (first.mo < new Date(pub || Date.now()).getMonth() + 1 ? y0 + 1 : y0);
  const ly = last.y || (last.mo < first.mo ? fy + 1 : fy);
  return { start: iso(fy, first.mo, 1), end: iso(ly, last.mo, 28) };
}
function iso(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(Math.min(28, Math.max(1, d))).padStart(2, "0"); }

async function interpret(item) {
  const text = item.title + " " + (item.cats || []).join(" ");
  if (!CLASS_RE.test(text)) return null;
  if (EXCLUDE_RE.test(item.title)) return null;
  const price = parsePrice(item.title) || parsePrice(item.body.slice(0, 600));
  if (!price) return null;
  const route = parseRoute(item.title);
  if (!route) return { skipped: "route illisible", item };
  const from = route.from || await placeCode(route.fromName);
  const to = route.to || await placeCode(route.toName);
  if (!to || to === "EU") return { skipped: "destination illisible", item };
  const origins = from === "EU" || !from ? EUROPE_HUBS : [from];
  const body = item.body || "";
  return {
    guid: item.guid, link: item.link, src: item.src, srcName: item.srcName, title: item.title, pub: item.pub ? new Date(item.pub).toISOString() : null,
    origins, to, price: price.price, currency: price.currency,
    deadline: parseDeadline(item.title + "\n" + body, item.pub), period: parsePeriod(body, item.pub),
    generic: from === "EU" || !from
  };
}

// ---------- entrée principale : relit les sources (au plus toutes les 25 min) et retourne les candidats ----------
async function refresh(force) {
  const last = await S.get("veille:last");
  if (!force && last && Date.now() - Date.parse(last.at) < 25 * 60000) return last;
  const seenAll = (await S.get("veille:seen")) || {};
  const out = { at: new Date().toISOString(), sources: {}, candidates: [], skipped: [] };
  const cutoff = Date.now() - 21 * 24 * 3600000;
  for (const src of SOURCES) {
    let items = [];
    try { items = await readSource(src); } catch (e) { out.sources[src.id] = "ERR " + (e.message || e); continue; }
    out.sources[src.id] = items.length;
    for (const it of items) {
      if (it.pub && it.pub < cutoff) continue;
      if (!src.business && !CLASS_RE.test(it.title + " " + it.cats.join(" "))) continue;
      const key = (it.guid || it.link || it.title).slice(0, 180);
      const r = await interpret(it);
      if (!r) continue;
      if (r.skipped) { out.skipped.push(r.skipped + " : " + it.title.slice(0, 90)); continue; }
      if (r.deadline && r.deadline < new Date().toISOString().slice(0, 10)) { out.skipped.push("échéance passée : " + it.title.slice(0, 90)); continue; }
      seenAll[key] = seenAll[key] || out.at;
      out.candidates.push(r);
    }
  }
  // dédoublonnage : même destination + prix à 5 % près → on garde le plus récent
  const uniq = []; for (const c of out.candidates.sort((a, b) => String(b.pub).localeCompare(String(a.pub)))) {
    if (!uniq.some(u => u.to === c.to && Math.abs(u.price - c.price) / c.price < 0.05 && u.origins.join() === c.origins.join())) uniq.push(c);
  }
  out.candidates = uniq.slice(0, 60); out.skipped = out.skipped.slice(0, 40);
  for (const k of Object.keys(seenAll)) if (Date.parse(seenAll[k]) < cutoff) delete seenAll[k];
  await S.set("veille:seen", seenAll, 30 * 24 * 3600);
  await S.set("veille:last", out, 48 * 3600);
  return out;
}

// Distance à vol d'oiseau entre deux villes (km), coordonnées via l'autocomplétion Travelpayouts, mémorisées 180 jours.
async function coords(code) {
  const k = "coord:" + code; const c = await S.get(k); if (c) return c === "-" ? null : c;
  let out = null;
  try {
    const resp = await fetch("https://autocomplete.travelpayouts.com/places2?locale=en&types[]=city&types[]=airport&term=" + encodeURIComponent(code), { headers: { "User-Agent": UA } });
    if (resp.ok) { const arr = await resp.json(); const hit = (Array.isArray(arr) ? arr : []).find(p => p.code === code) || (Array.isArray(arr) ? arr[0] : null); if (hit && hit.coordinates) out = { lat: hit.coordinates.lat, lon: hit.coordinates.lon }; }
  } catch (e) { out = null; }
  await S.set(k, out || "-", 180 * 24 * 3600);
  return out;
}
async function distanceKm(a, b) {
  const A = await coords(a), B = await coords(b); if (!A || !B) return null;
  const R = 6371, d2r = Math.PI / 180, dLat = (B.lat - A.lat) * d2r, dLon = (B.lon - A.lon) * d2r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * d2r) * Math.cos(B.lat * d2r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

module.exports = { distanceKm, coords, SOURCES, refresh, interpret, parsePrice, parseRoute, parseDeadline, parsePeriod, parseRss, parseHtmlList, EUROPE_HUBS };
