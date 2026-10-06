// ============================================================
// /api/deals — les deals affichés sur le site
//
// Uniquement ce que le robot (/api/scan) a VÉRIFIÉ en temps réel chez Amadeus :
// prix confirmé, compagnie, appareil, lit à plat ou non. Rien d'écrit à la main.
// Un deal dont la preuve date de plus de 24 h ou dont le départ est passé
// n'est pas servi. Section vide côté site quand la liste est vide.
// GET /api/deals            → { ok, deals:[…], scan:{at,…}, verifier }
// GET /api/deals?history=1  → ajoute l'historique de prix de chaque deal
// ============================================================
const D = require("./_data.js");
const S = require("./_store.js");
const A = require("./_amadeus.js");

const MAX_AGE_HOURS = 24;

module.exports = async (req, res) => {
  const q = req.query || {};
  const today = D.todayISO();
  const list = (await S.get("deals:list")) || [];
  const fresh = list.filter(d => d.dep > today && (Date.now() - Date.parse(d.verifiedAt)) / 3600000 < MAX_AGE_HOURS);
  const last = (await S.get("scan:last")) || null;

  const deals = fresh.map(d => ({
    id: d.id, from: d.from, to: d.to, dep: d.dep, ret: d.ret,
    price: d.price, prevPrice: d.prevPrice, changedAt: d.changedAt,
    median: d.median, discount: d.discount, distance: d.distance, perKm: d.perKm, dates: d.dates,
    carrier: d.carrier, carrierName: d.carrierName, carriers: d.carriers, aircraft: d.aircraft, stops: d.stops,
    seat: d.seat, seats: d.seats, reasons: d.reasons,
    foundAt: d.foundAt, verifiedAt: d.verifiedAt, link: d.link, airlines: D.airlinesFor(d.from, d.to)
  }));

  if (q.history === "1") {
    for (const d of deals) d.history = (await S.get("deals:history:" + d.id)) || [];
  }

  D.sendJson(res, 200, {
    ok: true,
    updated: new Date().toISOString(),
    verifier: A.ENABLED ? "amadeus" : "absent",
    store: S.PERSISTENT ? "upstash" : "mémoire",
    scan: last ? { at: last.at, amadeusUsed: last.amadeusUsed, cap: last.cap } : null,
    count: deals.length,
    deals,
    marker: D.MARKER
  }, 300);
};
