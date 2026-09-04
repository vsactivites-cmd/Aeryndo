// ============================================================
// /api/catalog — annuaire : aéroports, routes du radar, compagnies
// GET /api/catalog?q=tok           → autocomplétion villes/aéroports (Travelpayouts places, sans token)
// GET /api/catalog?airlines=1&from=CDG&to=HND → compagnies à lien direct pour la route
// GET /api/catalog                  → routes surveillées + annuaire compagnies
// ============================================================
const D = require("./_data.js");

const LOCALES = new Set(["fr", "en", "es", "de", "it", "pt", "ru", "zh", "ja", "ko", "th", "tr", "pl", "uk"]);

async function places(term, locale) {
  const url = "https://autocomplete.travelpayouts.com/places2?locale=" + locale +
    "&types[]=airport&types[]=city&term=" + encodeURIComponent(term);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return null;
    const arr = await resp.json();
    return (Array.isArray(arr) ? arr : []).slice(0, 10).map(p => ({
      code: p.code,
      name: p.name,
      city: p.city_name || p.name,
      country: p.country_name || "",
      type: p.type,
      main: p.main_airport_name || null
    }));
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const locale = LOCALES.has(String(q.locale || "")) ? String(q.locale) : "fr";

  if (q.q !== undefined) {
    const term = String(q.q || "").trim().slice(0, 40);
    if (term.length < 2) return D.sendJson(res, 200, { ok: true, results: [] }, 86400);
    const results = await places(term, locale);
    if (results === null) return D.sendJson(res, 502, { ok: false, error: "Autocomplétion indisponible", results: [] });
    return D.sendJson(res, 200, { ok: true, results }, 86400);
  }

  if (q.airlines !== undefined) {
    const from = String(q.from || "").toUpperCase(), to = String(q.to || "").toUpperCase();
    if (!D.isIATA(from) || !D.isIATA(to)) return D.sendJson(res, 400, { ok: false, error: "Codes IATA invalides" });
    return D.sendJson(res, 200, { ok: true, from, to, airlines: D.airlinesFor(from, to) }, 86400);
  }

  D.sendJson(res, 200, {
    ok: true,
    marker: D.MARKER,
    routes: D.ROUTES.map(r => ({ from: r.o, to: r.d, city: r.city, country: r.country, normal: r.normal })),
    airlines: Object.entries(D.AIRLINES).map(([code, a]) => ({ code, name: a.name, url: a.aff || a.url, aff: !!a.aff }))
  }, 86400);
};
