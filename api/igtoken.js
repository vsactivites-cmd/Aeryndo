// ============================================================
// /api/igtoken — coffre du jeton Instagram (un par marché), pour le robot Instagram (GitHub Actions)
// GET  /api/igtoken?key=CRON_SECRET&market=fr   → { ok, token, expiresAt } (ou ok:false si aucun jeton déposé)
// POST /api/igtoken?key=CRON_SECRET&market=fr   { token, expiresAt } → enregistre le jeton rafraîchi
// Le jeton Instagram « longue durée » vit 60 jours ; le robot le rafraîchit quand il reste < 15 jours
// et dépose le nouveau ici, pour ne jamais avoir à le ressaisir dans les secrets GitHub.
// Stocké dans Upstash (clé ig:token:<marché>). Jamais affiché sur le site, jamais sans la clé.
// ============================================================
const D = require("./_data.js");
const S = require("./_store.js");

module.exports = async (req, res) => {
  const q = req.query || {};
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret || String(q.key || "").trim() !== secret) return D.sendJson(res, 401, { ok: false, error: "clé requise" });
  const market = String(q.market || "fr").replace(/[^a-z0-9_-]/gi, "").slice(0, 12) || "fr";
  const key = "ig:token:" + market;
  try {
    if (req.method === "POST") {
      let body = req.body;
      if (!body || typeof body !== "object") {
        const raw = await new Promise((ok, ko) => { let s = ""; req.on("data", c => s += c); req.on("end", () => ok(s)); req.on("error", ko); });
        body = raw ? JSON.parse(raw) : {};
      }
      if (!body.token || String(body.token).length < 20) return D.sendJson(res, 400, { ok: false, error: "token manquant" });
      await S.set(key, { token: String(body.token).trim(), expiresAt: body.expiresAt || null, savedAt: new Date().toISOString() });
      return D.sendJson(res, 200, { ok: true, market, expiresAt: body.expiresAt || null });
    }
    const v = await S.get(key);
    if (!v) return D.sendJson(res, 200, { ok: false, market, error: "aucun jeton déposé" });
    return D.sendJson(res, 200, { ok: true, market, token: v.token, expiresAt: v.expiresAt, savedAt: v.savedAt });
  } catch (e) {
    return D.sendJson(res, 500, { ok: false, error: String(e && e.message || e) });
  }
};
