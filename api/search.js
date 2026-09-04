// ============================================================
// /api/search — toutes les dates et prix Business connus sur une route
// GET /api/search?from=CDG&to=HND&oneway=0&month=2026-10
//   from / to : codes IATA (3 lettres)
//   oneway    : 1 = aller simple, 0 = aller-retour (défaut)
//   month     : YYYY-MM, mois à densifier (défaut : mois courant)
// Source : Travelpayouts Data API (tarifs vus par les partenaires, cache 48 h).
// Le site affiche tout ; Aviasales n'est ouvert qu'au clic « Réserver ».
// ============================================================
const D = require("./_data.js");

module.exports = async (req, res) => {
  const q = req.query || {};
  const from = String(q.from || "").trim().toUpperCase();
  const to = String(q.to || "").trim().toUpperCase();
  const oneWay = q.oneway === "1" || q.oneway === "true";
  const month = D.isMonth(q.month) ? q.month : D.todayISO().slice(0, 7);

  if (!D.isIATA(from) || !D.isIATA(to) || from === to) {
    return D.sendJson(res, 400, { ok: false, error: "Codes IATA invalides" });
  }
  const token = process.env.TP_API_TOKEN;
  if (!token) {
    return D.sendJson(res, 503, { ok: false, error: "TP_API_TOKEN manquant dans Vercel", from, to, oneWay, offers: [], airlines: D.airlinesFor(from, to) });
  }

  // 1) année glissante (jusqu'à 1000 tarifs) · 2) mois demandé (densification)
  const [year, focus] = await Promise.all([
    D.fetchLatest(token, from, to, oneWay),
    D.fetchLatest(token, from, to, oneWay, { period_type: "month", beginning_of_period: month + "-01" })
  ]);

  if (!year.ok && !focus.ok) {
    return D.sendJson(res, 502, { ok: false, error: "Partenaire injoignable : " + (year.error || focus.error || "?"), from, to, oneWay, offers: [], airlines: D.airlinesFor(from, to) });
  }

  const offers = D.mergeOffers([year.offers, focus.offers])
    .filter(o => oneWay ? !o.ret : !!o.ret)
    .sort((a, b) => a.price - b.price || a.dep.localeCompare(b.dep));

  // minimum par mois de départ (bandeau des mois côté site)
  const months = {};
  for (const o of offers) {
    const m = o.dep.slice(0, 7);
    if (!months[m] || o.price < months[m]) months[m] = o.price;
  }

  D.sendJson(res, 200, {
    ok: true,
    from, to, oneWay, month,
    count: offers.length,
    updated: new Date().toISOString(),
    offers,
    months,
    airlines: D.airlinesFor(from, to),
    normal: (D.ROUTES.find(r => r.o === from && r.d === to) || {}).normal || null,
    marker: D.MARKER
  }, 1800);
};
