// ============================================================
// /api/igtrigger — déclenche le robot Instagram (GitHub Actions) à l'heure exacte
// GET /api/igtrigger?key=CRON_SECRET&slot=piege            → lance le workflow « Robot Instagram » (marché fr)
// GET /api/igtrigger?key=CRON_SECRET&slot=reel&market=fr
// Pourquoi : le planificateur de GitHub Actions (cron) tourne quand il veut — constaté du 9 au 13 oct. 2026 :
// 4 à 7 exécutions par jour au lieu de 24, aucune dans les fenêtres de publication. Un service de cron
// externe précis à la minute (cron-job.org) appelle cette adresse aux heures choisies ; elle demande à
// GitHub de lancer le workflow immédiatement avec le créneau forcé (run.js ignore alors l'heure).
// Variable Vercel requise : GITHUB_TOKEN (jeton à granularité fine, dépôt Aeryndo, Actions : lecture/écriture).
// Jamais deux posts le même jour pour un même créneau : run.js vérifie state.json.
// ============================================================
const D = require("./_data.js");

const REPO = process.env.GITHUB_REPO || "vsactivites-cmd/Aeryndo";
const SLOTS = new Set(["piege", "deal", "reel", "story-piege", "story-deal", "story-reel"]);

module.exports = async (req, res) => {
  const q = req.query || {};
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret || String(q.key || "").trim() !== secret) return D.sendJson(res, 401, { ok: false, error: "clé requise" });
  const slot = String(q.slot || "").trim();
  if (!SLOTS.has(slot)) return D.sendJson(res, 400, { ok: false, error: "slot inconnu", slots: [...SLOTS] });
  const market = String(q.market || "fr").replace(/[^a-z0-9_-]/gi, "").slice(0, 12) || "fr";
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) return D.sendJson(res, 500, { ok: false, error: "GITHUB_TOKEN manquant dans Vercel" });
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/instagram.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "AeryndoBot/1.0", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { slot, market, dry: q.dry === "1" ? "1" : q.dry === "0" ? "0" : "" } })
    });
    if (r.status === 204) return D.sendJson(res, 200, { ok: true, slot, market, at: new Date().toISOString(), note: "workflow lancé ; voir github.com/" + REPO + "/actions" });
    const txt = await r.text();
    return D.sendJson(res, 502, { ok: false, error: "GitHub " + r.status + " " + txt.slice(0, 300) });
  } catch (e) {
    return D.sendJson(res, 500, { ok: false, error: String(e && e.message || e) });
  }
};
