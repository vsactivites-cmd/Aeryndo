// ============================================================
// /api/viseur — le tableau de chasse en direct (v9.1, 4 nov. 2026)
//
// Ce que le robot a dans le viseur en ce moment : les annonces des sites de deals
// qu'il a lues (en attente de vérification sur Google Flights), les routes du cache
// partenaire qui passent la charte, et ce qu'il a écarté après vérification — avec
// la raison. Rien ici n'est un deal : c'est le carnet de chasse, montré tel quel.
// Public, mis en cache 10 minutes. Aucun lien de réservation (un prix non vérifié
// ne se réserve pas chez nous).
// ============================================================
const D = require("./_data.js");
const S = require("./_store.js");

module.exports = async (req, res) => {
  let veille = null, last = null, cands = null, deals = [];
  try {
    [veille, last, cands, deals] = await Promise.all([
      S.get("veille:last").catch(() => null), S.get("scan:last").catch(() => null),
      S.get("scan:candidates").catch(() => null), S.get("deals:list").catch(() => [])
    ]);
  } catch (e) { /* mémoire indisponible : tableau vide */ }
  const shown = new Set((deals || []).map(d => d.id));
  const today = D.todayISO();

  // Annonces des sites de deals, les plus récentes d'abord, sans celles déjà affichées comme deal ni expirées.
  const queue = ((veille && veille.candidates) || [])
    .filter(c => c && c.to && (!c.deadline || c.deadline >= today))
    .filter(c => !(c.origins || []).some(o => shown.has(o + "-" + c.to)))
    .sort((a, b) => String(b.pub || "").localeCompare(String(a.pub || "")))
    .slice(0, 24)
    .map(c => ({ from: c.generic ? null : (c.origins || [])[0] || null, generic: !!c.generic, to: c.to, price: c.price, src: c.srcName || null, pub: c.pub || null, deadline: c.deadline || null, period: c.period || null }));

  // Routes du cache partenaire qui passent la charte (candidats du dernier balayage), hors deals affichés.
  const radar = (((cands && cands.list) || []).filter(c => c && !shown.has(c.from + "-" + c.to)).slice(0, 10))
    .map(c => ({ from: c.from, to: c.to, price: c.price, perKm: c.perKm || null, discount: c.discount || null, dep: c.dep || null, ret: c.ret || null, dates: c.dates || null }));

  // Écartés après vérification : les motifs du robot, tels quels (prix en direct trop haut, siège inclinable, cabine mixte…).
  const log = (last && last.log) || {};
  const rejected = []
    .concat(((log.veille && log.veille.rejected) || []).map(r => ({ kind: "veille", text: r })))
    .concat((log.rejected || []).map(r => ({ kind: "cache", text: r })))
    .slice(0, 12);

  D.sendJson(res, 200, {
    ok: true,
    at: (veille && veille.at) || null, scanAt: (last && last.at) || null,
    used: last ? last.verifyUsed : null, cap: last ? last.cap : null,
    sources: veille && veille.sources ? Object.keys(veille.sources).filter(k => Number(veille.sources[k]) > 0).length : null,
    sourcesTotal: veille && veille.sources ? Object.keys(veille.sources).length : null,
    queue, radar, rejected, verified: log.verified || 0
  }, 600);
};
