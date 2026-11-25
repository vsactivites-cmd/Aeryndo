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
//   → arrête le suivi (lien en bas de chaque email) ; sans route : désinscription complète (liste Brevo comprise).
// v10 (25 nov. 2026) — « le deal + le refusé » :
//   · inscription sans trajet → email de bienvenue immédiat (deals vérifiés du moment, refus de la semaine, journal) ;
//   · GET ?digest=1&key=CRON_SECRET[&dry=1] → digest du vendredi à toute la liste Brevo (déclenché par le robot
//     Instagram, créneau `digest`, parce que le plan Vercel Hobby limite à 2 crons et 12 fonctions).
// La clé Brevo n'est JAMAIS dans le code : variable BREVO_API_KEY sur Vercel.
// ============================================================
const D = require("./_data.js");
const S = require("./_store.js");
const M = require("./_mail.js");
const P = require("./_palmares.js");

const BREVO_LIST = 3;
const BREVO = { accept: "application/json", "content-type": "application/json" };
async function brevoRemove(email) {
  const KEY = process.env.BREVO_API_KEY; if (!KEY) return false;
  try {
    const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LIST}/contacts/remove`, { method: "POST", headers: Object.assign({ "api-key": KEY }, BREVO), body: JSON.stringify({ emails: [email] }) });
    return r.ok || r.status === 204;
  } catch (e) { return false; }
}
async function brevoList() {
  const KEY = process.env.BREVO_API_KEY; if (!KEY) return [];
  const out = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LIST}/contacts?limit=500&offset=${offset}`, { headers: Object.assign({ "api-key": KEY }, BREVO) });
    if (!r.ok) break;
    const j = await r.json();
    const list = (j && j.contacts) || [];
    for (const c of list) if (c && c.email && !c.emailBlacklisted) out.push(String(c.email).toLowerCase());
    if (list.length < 500) break;
  }
  return out;
}

// La matière de l'email : deals vérifiés, refus de la semaine, noms de villes.
async function dealsMaterial() {
  const [raw, refused] = await Promise.all([S.get("deals:list").catch(() => []), S.get("scan:refused").catch(() => [])]);
  // mêmes champs dérivés que /api/deals (économie vs médiane de la route, date limite annoncée par la source)
  const deals = (raw || []).map(d => Object.assign({}, d, {
    savings: d.median && d.median > d.price ? Math.round(d.median - d.price) : null,
    deadline: d.source && d.source.deadline ? d.source.deadline : null,
    carrierName: d.carrierName || d.carrier
  }));
  const codes = new Set();
  for (const d of deals || []) { codes.add(d.from); codes.add(d.to); }
  for (const r of (refused || []).slice(-40)) { const m = /^([A-Z]{3})-([A-Z]{3})/.exec(String(r.text || "")); if (m) { codes.add(m[1]); codes.add(m[2]); } }
  const names = {};
  await Promise.all([...codes].map(async c => { try { names[c] = await P.cityNames(c); } catch (e) { names[c] = null; } }));
  return { deals, refused: refused || [], names };
}

async function sendDigest(dry) {
  const mat = await dealsMaterial();
  const emails = await brevoList();
  const stats = { at: new Date().toISOString(), recipients: emails.length, deals: mat.deals.length, sent: 0, failed: 0, dry: !!dry };
  if (!mat.deals.length) { stats.skipped = "aucun deal vérifié"; await S.set("digest:last", stats, 30 * 24 * 3600); return stats; }
  for (const email of emails.slice(0, 280)) {           // plan Brevo gratuit : 300 emails/jour
    const sub = (await S.get("sub:" + email).catch(() => null)) || {};
    const mail = M.dealsEmail(Object.assign({ kind: "weekly", email, l: sub.lang || "fr" }, mat));
    if (dry) { stats.sent++; stats.preview = stats.preview || { to: email.replace(/(.).+(@.*)/, "$1…$2"), subject: mail.subject }; continue; }
    const r = await M.send(email, mail);
    if (r.ok) stats.sent++; else stats.failed++;
  }
  if (!dry) await S.set("digest:last", stats, 30 * 24 * 3600);
  return stats;
}

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

  // ---------- digest du vendredi (robot) ----------
  if (req.method === "GET" && String((req.query || {}).digest || "") === "1") {
    const q = req.query || {};
    const secret = (process.env.CRON_SECRET || "").trim();
    const auth = String((req.headers && req.headers.authorization) || "").trim();
    if (secret && String(q.key || "").trim() !== secret && auth !== "Bearer " + secret) return json(res, 401, { ok: false, error: "clé requise" });
    try { return json(res, 200, Object.assign({ ok: true }, await sendDigest(String(q.dry || "") === "1"))); }
    catch (e) { return json(res, 500, { ok: false, error: String(e && e.message || e) }); }
  }

  // ---------- désinscription (lien signé) ----------
  if (req.method === "GET") {
    const q = req.query || {};
    if (!q.stop || !q.sig) return json(res, 405, { error: "Method not allowed" });
    let email = "";
    try { email = Buffer.from(String(q.stop), "base64url").toString("utf8").toLowerCase(); } catch (e) {}
    if (!email || M.sig(email) !== String(q.sig)) return json(res, 403, { error: "Lien invalide" });
    const routeId = q.route ? String(q.route).toUpperCase() : null;
    await stopWatch(email, routeId);
    if (!routeId) { await brevoRemove(email); await S.del("sub:" + email).catch(() => {}); }
    cors(res);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const msg = routeId ? ["Suivi arrêté.", "Vous ne recevrez plus d'alerte pour ce trajet."] : ["Désinscription effectuée.", "Vous ne recevrez plus d'email d'Aeryndo."];
    return res.status(200).end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aeryndo</title><body style="margin:0;background:#0E0E0F;color:#F3F0E9;font-family:Georgia,serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><div style="font-size:14px;letter-spacing:4px">AERYNDO</div><p style="font-size:22px;margin:18px 0 8px">${msg[0]}</p><p style="color:#b8b3aa;font-family:Arial,sans-serif;font-size:14px">${msg[1]} <a href="https://aeryndo.co" style="color:#FF6B57">Retour au site</a></p></div></body>`);
  }
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // Origine : le formulaire vit sur aeryndo.co (et ses previews Vercel).
  const origin = String(req.headers.origin || req.headers.referer || "");
  if (origin && !/^https:\/\/(([a-z0-9-]+\.)*aeryndo\.co|aeryndo(-[a-z0-9-]+)?\.vercel\.app)(\/|$)/i.test(origin)) {
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
    const known = await S.get("sub:" + email).catch(() => null);
    await S.set("sub:" + email, { lang, since: (known && known.since) || new Date().toISOString() }, 400 * 24 * 3600).catch(() => {});

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
    } else if (!known) {
      // v10 : première inscription sans trajet → bienvenue avec les deals vérifiés du moment (une seule fois par adresse)
      try { const mat = await dealsMaterial(); const r = await M.send(email, M.dealsEmail(Object.assign({ kind: "welcome", email, l: lang }, mat))); mailed = !!r.ok; }
      catch (e) { console.error("bienvenue : " + (e && e.message || e)); }
    }
    return json(res, 200, { ok: true, added, watching: route ? route.id : null, mailed, price, persistent: S.PERSISTENT });
  } catch (e) {
    return json(res, 200, { ok: true, error: String(e && e.message || e) }); // on ne bloque jamais l'utilisateur côté site
  }
};
