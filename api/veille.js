// ============================================================
// /api/veille — diagnostic de la veille : ce que le robot a lu sur les sites de deals
// GET /api/veille?key=CRON_SECRET          → dernière lecture (sources, candidats, écartés)
// GET /api/veille?key=CRON_SECRET&force=1  → relit les sources maintenant
// Ne vérifie rien et ne publie rien : la vérification Google Flights se fait dans /api/scan.
// ============================================================
const D = require("./_data.js");
const VE = require("./_veille.js");

module.exports = async (req, res) => {
  const q = req.query || {};
  const secret = (process.env.CRON_SECRET || "").trim();
  if (secret && String(q.key || "").trim() !== secret) return D.sendJson(res, 401, { ok: false, error: "clé requise" });
  try {
    const out = await VE.refresh(q.force === "1");
    return D.sendJson(res, 200, Object.assign({ ok: true, sourcesList: VE.SOURCES.map(s => s.id + " " + s.url) }, out));
  } catch (e) {
    return D.sendJson(res, 500, { ok: false, error: String(e && e.message || e) });
  }
};
