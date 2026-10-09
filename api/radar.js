// ============================================================
// RADAR AERYNDO — le bloc vivant de la première page
// GET /api/radar            → JSON : meilleur tarif Business par route surveillée
// GET /api/radar?alert=1    → mode nuit : scan + email Brevo si prix sous le seuil
// Le cron Vercel (vercel.json, 05:00 UTC) appelle /api/radar avec le
// user-agent "vercel-cron" : il déclenche automatiquement le mode alerte.
// ============================================================
const D = require("./_data.js");
const S = require("./_store.js");

// Instantané écrit par /api/scan (toutes les ~30 min). Servi tel quel tant qu'il a moins de SNAPSHOT_MAX_AGE.
const SNAPSHOT_MAX_AGE_MS = 2 * 3600 * 1000;

async function scan(token) {
  const results = await Promise.all(D.ROUTES.map(async r => {
    try {
      // Aller-retour d'abord ; si le cache Business n'a que des allers simples, on les montre (le front l'indique).
      // 1000 lignes (et non 100) : la médiane de la route se calcule sur tout le cache, pas sur les 100 moins chers.
      let res = await D.fetchLatest(token, r.o, r.d, false, { limit: 1000 });
      let offers = res.ok ? res.offers.filter(o => o.ret) : [];
      if (res.ok && !offers.length) {
        const ow = await D.fetchLatest(token, r.o, r.d, true, { limit: 100 });
        if (ow.ok) offers = ow.offers.filter(o => !o.ret);
      }
      return { route: r, ok: res.ok, error: res.ok ? null : res.error, offers };
    } catch (e) { return { route: r, ok: false, error: String(e && e.message || e), offers: [] }; }
  }));
  return results.map(x => {
    // Au plus une escale quand le cache le permet : un tarif à 3 escales n'est pas une vitrine Business.
    const pool = x.offers.filter(o => o.changes === null || o.changes <= 1);
    const shown = pool.length ? pool : x.offers;
    const best = shown.length ? shown.reduce((a, b) => (a.price <= b.price ? a : b)) : null;
    // Remise mesurée contre la médiane des tarifs de la route elle-même (cache Travelpayouts),
    // jamais contre un chiffre écrit en dur. Pas assez d'échantillons → pas de remise affichée.
    const med = x.offers.length >= D.MIN_SAMPLES ? D.median(x.offers.map(o => o.price)) : null;
    const pct = best && best.ret && med ? Math.round((1 - best.price / med) * 100) : null;
    return {
      from: x.route.o, to: x.route.d, city: x.route.city, country: x.route.country,
      normal: x.route.normal, median: med, ok: x.ok, count: x.offers.length, error: x.error || undefined,
      best: best ? Object.assign({}, best, {
        pct: pct !== null && pct > 0 ? pct : null,
        link: D.aviasalesLink({ from: x.route.o, to: x.route.d, dep: best.dep, ret: best.ret, pax: 1, sub: D.SUB.radar })
      }) : null,
      airlines: D.airlinesFor(x.route.o, x.route.d)
    };
  });
}

// ---------- mode alerte (email Brevo) ----------
function euros(n) { return n.toLocaleString("fr-FR") + " €"; }

function buildEmail(hits) {
  const rows = hits.map(h => {
    const link = D.aviasalesLink({ from: h.from, to: h.to, dep: h.best.dep, ret: h.best.ret, pax: 1, sub: D.SUB.mail });
    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a2e;">
          <div style="font-size:18px;color:#F3F0E9;">${h.from} → ${h.to} · ${h.city}</div>
          <div style="font-size:13px;color:#b8b3aa;margin-top:4px;">Départ ${h.best.dep}${h.best.ret ? " · retour " + h.best.ret : ""}</div>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a2e;text-align:right;">
          <div style="font-size:20px;color:#FF6B57;">${euros(h.best.price)}</div>
          <div style="font-size:12px;color:#b8b3aa;">${h.best.pct ? "−" + h.best.pct + "% vs médiane (" + euros(h.median || h.normal) + ")" : "référence : " + euros(h.median || h.normal)}</div>
          <a href="${link}" style="font-size:12px;color:#F3F0E9;">Vérifier →</a>
        </td>
      </tr>`;
  }).join("");
  const intro = hits.length
    ? `Le radar a détecté ${hits.length} tarif(s) Business sous le seuil d'alerte.`
    : "Aucun tarif sous le seuil cette nuit — test de bon fonctionnement réussi.";
  return `
  <div style="background:#0E0E0F;padding:32px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="font-size:22px;letter-spacing:4px;color:#F3F0E9;">AERYNDO</div>
      <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin:6px 0 24px;">RADAR · RAPPORT DE NUIT</div>
      <p style="color:#b8b3aa;font-size:14px;line-height:1.6;">${intro}
        À vérifier à la main avant toute publication : disponibilité, compagnie, vraie cabine.</p>
      <table style="width:100%;border-collapse:collapse;background:#161516;">${rows}</table>
      <p style="color:#8f8a82;font-size:11px;margin-top:20px;">
        Seuil : ${Math.round(D.THRESHOLD * 100)}% de la normale par route · données Travelpayouts · marker ${D.MARKER}
      </p>
    </div>
  </div>`;
}

async function sendEmail(apiKey, html, subject) {
  const to = process.env.ALERT_EMAIL || "contact@aeryndo.co";
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { name: "Radar Aeryndo", email: "contact@aeryndo.co" },
      to: [{ email: to }], subject, htmlContent: html
    })
  });
  return resp.ok;
}

module.exports = async (req, res) => {
  const token = process.env.TP_API_TOKEN;
  const q = req.query || {};
  const ua = String((req.headers && req.headers["user-agent"]) || "");
  // Mode alerte (envoi d'email) réservé au cron Vercel ou à un appel porteur du secret.
  // Avant : n'importe qui pouvait déclencher un email avec ?alert=1.
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = String((req.headers && req.headers.authorization) || "");
  const fromCron = /vercel-cron/i.test(ua) && (!secret || auth === "Bearer " + secret);
  const withKey = secret && String(q.key || "").trim() === secret;
  const alertMode = fromCron || withKey;
  const isTest = q.test === "1" && alertMode;

  if (!token) {
    // Pas de token : on renvoie quand même les routes pour que le bloc reste lisible.
    return D.sendJson(res, 200, {
      ok: false, error: "TP_API_TOKEN manquant dans Vercel", updated: new Date().toISOString(),
      routes: D.ROUTES.map(r => ({ from: r.o, to: r.d, city: r.city, country: r.country, normal: r.normal, ok: false, count: 0, best: null, airlines: D.airlinesFor(r.o, r.d) }))
    });
  }

  let routes = null, snapshotAt = null;
  if (!alertMode) {
    const snap = await S.get("radar:snapshot").catch(() => null);
    if (snap && snap.routes && Date.now() - Date.parse(snap.at) < SNAPSHOT_MAX_AGE_MS) { routes = snap.routes; snapshotAt = snap.at; }
  }
  if (!routes) {
    routes = await scan(token);
    await S.set("radar:snapshot", { at: new Date().toISOString(), routes }, 6 * 3600).catch(() => {});
  }

  if (alertMode) {
    const brevo = process.env.BREVO_API_KEY;
    if (!brevo) return D.sendJson(res, 500, { ok: false, error: "BREVO_API_KEY manquant dans Vercel" });
    // Seuil : 65 % de la médiane de la route (ou du « normal » de secours si le cache est trop mince).
    const hits = routes.filter(r => r.best && r.best.ret && r.best.price <= (r.median || r.normal) * D.THRESHOLD);
    let emailed = false;
    if (hits.length) emailed = await sendEmail(brevo, buildEmail(hits), `✈ Radar Aeryndo — ${hits.length} tarif(s) sous le seuil`);
    else if (isTest) emailed = await sendEmail(brevo, buildEmail([]), "✈ Radar Aeryndo — test OK, radar opérationnel");
    return D.sendJson(res, 200, {
      ok: true, mode: "alert", scanned: routes.length,
      routesAvecDonnees: routes.filter(r => r.count).length,
      alertes: hits.map(h => ({ route: h.from + "-" + h.to, prix: h.best.price, mediane: h.median, normale: h.normal })),
      emailEnvoye: emailed
    });
  }

  // Bloc public : toutes les routes surveillées, meilleures remises d'abord, sans donnée à la fin.
  // (Le seuil THRESHOLD ne sert qu'à l'alerte email.)
  const score = r => (r.best && typeof r.best.pct === "number") ? r.best.pct : (r.best ? -1 : -999);
  routes.sort((a, b) => score(b) - score(a));
  D.sendJson(res, 200, {
    ok: true, updated: snapshotAt || new Date().toISOString(), source: snapshotAt ? "scan" : "live", threshold: D.THRESHOLD, market: D.MARKET, marker: D.MARKER, routes
  }, 1800);
};
module.exports.scan = scan;
