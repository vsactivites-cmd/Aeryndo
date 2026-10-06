// ============================================================
// /api/search — toutes les dates et prix Business connus sur une route
// GET /api/search?from=CDG&to=HND&oneway=0&month=2026-10
//   from / to : codes IATA (3 lettres)
//   oneway    : 1 = aller simple, 0 = aller-retour (défaut)
//   month     : YYYY-MM, mois à densifier en priorité (défaut : mois courant)
// Source : Travelpayouts Data API (tarifs vus par les partenaires, cache 48 h).
// Le site affiche tout ; Aviasales n'est ouvert qu'au clic « Réserver ».
//
// Horizon : douze mois d'avance, interrogés MOIS PAR MOIS (get_latest_prices en
// période « month », marché fr), en plus des deux balayages annuels. Un balayage
// annuel seul rend trop peu de dates en Business ; mois par mois, le bandeau des
// mois se remplit.
// ============================================================
const D = require("./_data.js");

const HORIZON_MONTHS = 12;

function monthKeys(count) {
  const now = new Date();
  const keys = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  // Aéroport → ville : le cache est indexé par ville (CDG devient PAR, HND devient TYO).
  const from = D.cityCode(String(q.from || "").trim());
  const to = D.cityCode(String(q.to || "").trim());
  const oneWay = q.oneway === "1" || q.oneway === "true";
  const month = D.isMonth(q.month) ? q.month : D.todayISO().slice(0, 7);

  if (!D.isIATA(from) || !D.isIATA(to) || from === to) {
    return D.sendJson(res, 400, { ok: false, error: "Codes IATA invalides" });
  }
  const token = process.env.TP_API_TOKEN;
  if (!token) {
    return D.sendJson(res, 503, { ok: false, error: "TP_API_TOKEN manquant dans Vercel", from, to, oneWay, offers: [], airlines: D.airlinesFor(from, to) });
  }

  const today = D.todayISO();
  const plusYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const keys = monthKeys(HORIZON_MONTHS);
  const sweep = keys.includes(month) ? keys : keys.concat([month]);

  // 1) deux années glissantes (aujourd'hui, puis +12 mois)
  // 2) chaque mois de l'horizon, jour par jour, avec deux sources
  const calls = [
    D.fetchLatest(token, from, to, oneWay, { beginning_of_period: today }),
    D.fetchLatest(token, from, to, oneWay, { beginning_of_period: plusYear })
  ];
  // Une seule source par mois : get_latest_prices v3, la seule qui accepte le paramètre
  // market. /v2/prices/month-matrix ne le connaît pas et servirait le marché russe.
  for (const mk of sweep) {
    calls.push(D.fetchLatest(token, from, to, oneWay, { period_type: "month", beginning_of_period: mk + "-01" }));
  }
  const settled = await Promise.all(calls.map(p => p.catch(e => ({ ok: false, error: String(e && e.message || e), offers: [] }))));

  const answered = settled.filter(r => r && r.ok);
  if (!answered.length) {
    const first = settled.find(r => r && r.error) || {};
    return D.sendJson(res, 502, { ok: false, error: "Partenaire injoignable : " + (first.error || "?"), from, to, oneWay, offers: [], airlines: D.airlinesFor(from, to) });
  }

  const offers = D.mergeOffers(answered.map(r => r.offers))
    .filter(o => oneWay ? !o.ret : !!o.ret)
    .sort((a, b) => a.price - b.price || a.dep.localeCompare(b.dep));

  // minimum par mois de départ (bandeau des mois côté site)
  const months = {};
  for (const o of offers) {
    const m = o.dep.slice(0, 7);
    if (!months[m] || o.price < months[m]) months[m] = o.price;
  }

  // Médiane des tarifs de la route : la seule référence honnête pour parler de remise.
  // En dessous de MIN_SAMPLES échantillons, pas de médiane, donc pas de « −X % ».
  const median = offers.length >= D.MIN_SAMPLES ? D.median(offers.map(o => o.price)) : null;

  D.sendJson(res, 200, {
    ok: true,
    from, to, oneWay, month,
    horizon: keys,
    sources: { asked: calls.length, answered: answered.length },
    count: offers.length,
    updated: new Date().toISOString(),
    offers,
    months,
    airlines: D.airlinesFor(from, to),
    median,
    samples: offers.length,
    market: D.MARKET,
    normal: (D.ROUTES.find(r => r.o === from && r.d === to) || {}).normal || null,
    marker: D.MARKER
  }, 900);
};
