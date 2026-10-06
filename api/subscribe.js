// ============================================================
// /api/subscribe — inscription aux deals + suivi d'un trajet
//
// POST { email, lang?, route?: { from, to, oneway?, dep?, ret? } }
//   1. ajoute le contact à la liste Brevo « Alertes Aeryndo » (id 3) ;
//   2. si un trajet est joint (la personne vient de faire une recherche) :
//      - le trajet est mémorisé pour cette adresse (Upstash) ;
//      - un email part immédiatement avec les meilleurs tarifs du moment ;
//      - le robot (/api/scan) surveille ensuite la route et envoie une
//        alerte à chaque baisse de prix.
// GET ?stop=<email base64url>&sig=<signature>[&route=PAR-TYO]
//   → arrête le suivi (lien en bas de chaque email).
// La clé Brevo n'est JAMAIS dans le code : variable BREVO_API_KEY sur Vercel.
// ============================================================
const D = require("./_data.js");
const S = require("./_store.js");
const M = require("./_mail.js");

const MAX_ROUTES_PER_EMAIL = 5;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function json(res, status, body) { cors(res); res.setHeader("Cache-Control", "no-store"); res.status(status).json(body); }

async function brevoContact(email) {
  const KEY = process.env.BREVO_API_KEY;
  if (!KEY) return false;
  try {
    const r = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": KEY },
      body: JSON.stringify({ email, listIds: [3], updateEnabled: true })
    });
    return r.ok || r.status === 204;
  } catch (e) { return false; }
}

// Tarifs actuels d'une route (deux balayages annuels du cache, marché fr).
async function currentOffers(token, route) {
  if (!token) return { offers: [], median: null };
  const today = D.todayISO();
  const plusYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const calls = [
    D.fetchLatest(token, route.from, route.to, route.oneway, { beginning_of_period: today }),
    D.fetchLatest(token, route.from, route.to, route.oneway, { beginning_of_period: plusYear })
  ];
  if (route.dep && D.isISODate(route.dep)) calls.push(D.fetchLatest(token, route.from, route.to, route.oneway, { period_type: "month", beginning_of_period: route.dep.slice(0, 7) + "-01" }));
  const settled = await Promise.all(calls.map(p => p.catch(() => ({ ok: false, offers: [] }))));
  const offers = D.mergeOffers(settled.filter(r => r.ok).map(r => r.offers)).filter(o => route.oneway ? !o.ret : !!o.ret);
  const median = offers.length >= D.MIN_SAMPLES ? D.median(offers.map(o => o.price)) : null;
  return { offers, median };
}

async function addWatch(email, lang, route, price) {
  const key = "watch:" + email;
  const w = (await S.get(key)) || { email, lang, routes: [] };
  w.lang = lang || w.lang || "fr";
  const i = w.routes.findIndex(r => r.id === route.id);
  const entry = Object.assign({}, route, { since: new Date().toISOString(), ref: price || null, lastAlert: null, lastAlertPrice: price || null });
  if (i >= 0) w.routes[i] = Object.assign(w.routes[i], { ref: price || w.routes[i].ref, dep: route.dep, ret: route.ret });
  else { w.routes.push(entry); w.routes = w.routes.slice(-MAX_ROUTES_PER_EMAIL); }
  await S.set(key, w);
  const idx = (await S.get("watch:index")) || [];
  if (!idx.includes(email)) { idx.push(email); await S.set("watch:index", idx); }
}

async function stopWatch(email, routeId) {
  const key = "watch:" + email;
  const w = await S.get(key);
  if (!w) return;
  w.routes = routeId ? w.routes.filter(r => r.id !== routeId) : [];
  if (w.routes.length) await S.set(key, w);
  else {
    await S.del(key);
    const idx = ((await S.get("watch:index")) || []).filter(e => e !== email);
    await S.set("watch:index", idx);
  }
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }

  // ---------- désinscription (lien signé) ----------
  if (req.method === "GET") {
    const q = req.query || {};
    if (!q.stop || !q.sig) return json(res, 405, { error: "Method not allowed" });
    let email = "";
    try { email = Buffer.from(String(q.stop), "base64url").toString("utf8").toLowerCase(); } catch (e) {}
    if (!email || M.sig(email) !== String(q.sig)) return json(res, 403, { error: "Lien invalide" });
    await stopWatch(email, q.route ? String(q.route).toUpperCase() : null);
    cors(res);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aeryndo</title><body style="margin:0;background:#0E0E0F;color:#F3F0E9;font-family:Georgia,serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><div style="font-size:14px;letter-spacing:4px">AERYNDO</div><p style="font-size:22px;margin:18px 0 8px">Suivi arrêté.</p><p style="color:#b8b3aa;font-family:Arial,sans-serif;font-size:14px">Vous ne recevrez plus d'alerte pour ce trajet. <a href="https://aeryndo.co" style="color:#FF6B57">Retour au site</a></p></div></body>`);
  }
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // Origine : le formulaire vit sur aeryndo.co (et ses previews Vercel).
  const origin = String(req.headers.origin || req.headers.referer || "");
  if (origin && !/^https:\/\/([a-z0-9-]+\.)*(aeryndo\.co|vercel\.app)(\/|$)/i.test(origin)) {
    return json(res, 403, { error: "Origine non autorisée" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: "Email invalide" });
    const lang = M.lang(String(body.lang || "fr").slice(0, 2));

    const added = await brevoContact(email);

    // ---------- trajet à suivre ----------
    let route = null;
    if (body.route && body.route.from && body.route.to) {
      const from = D.cityCode(String(body.route.from).trim()), to = D.cityCode(String(body.route.to).trim());
      if (D.isIATA(from) && D.isIATA(to) && from !== to) {
        route = { id: from + "-" + to, from, to, oneway: !!body.route.oneway, dep: D.isISODate(body.route.dep) ? body.route.dep : null, ret: D.isISODate(body.route.ret) ? body.route.ret : null };
      }
    }
    let mailed = false, price = null;
    if (route) {
      const { offers, median } = await currentOffers(process.env.TP_API_TOKEN, route);
      price = offers.length ? Math.min.apply(null, offers.map(o => o.price)) : null;
      await addWatch(email, lang, route, price);
      const r = await M.send(email, M.routeEmail(route, offers, median, email, lang));
      mailed = !!r.ok;
    }
    return json(res, 200, { ok: true, added, watching: route ? route.id : null, mailed, price, persistent: S.PERSISTENT });
  } catch (e) {
    return json(res, 200, { ok: true, error: String(e && e.message || e) }); // on ne bloque jamais l'utilisateur côté site
  }
};
