// ============================================================
// /api/scan — le robot de chasse Aeryndo (balayage continu)
//
// Appelé toutes les ~30 minutes (GitHub Actions) + une fois par nuit (cron Vercel).
// Chaque passage, borné à ~45 s :
//   1. RADAR : rafraîchit les routes surveillées (instantané pour la première page).
//   2. RE-VÉRIFICATION : les deals affichés dont la preuve a plus de REVERIFY_HOURS
//      sont re-vérifiés en direct ; prix mis à jour, deal retiré s'il n'existe plus.
//   3. DÉCOUVERTE : avance d'un cran dans le panier mondial (round-robin), lit le
//      cache Travelpayouts (marché fr), note les candidats selon la charte.
//   4. VÉRIFICATION : les meilleurs candidats sont confirmés en temps réel par
//      Google Flights (SerpApi) ou Amadeus — voir _verify.js — (prix ≤ +10 %,
//      cabine Business, lit à plat sur le long-courrier).
//      Seuls les deals vérifiés sont écrits en mémoire, donc affichés.
//   5. TRAJETS SUIVIS : chaque route qu'un visiteur a cherchée puis suivie par
//      email est relue ; si son meilleur tarif baisse d'au moins DROP_PCT, la
//      personne reçoit une alerte (au plus une toutes les ALERT_GAP_HOURS).
//
// Protection : ?key=CRON_SECRET (ou user-agent vercel-cron). Sans CRON_SECRET
// défini, l'appel est libre mais un verrou empêche deux passages simultanés.
// ============================================================
const D = require("./_data.js");
const C = require("./_charte.js");
const V = require("./_verify.js");
const VE = require("./_veille.js");
const S = require("./_store.js");
const radar = require("./radar.js");
const M = require("./_mail.js");

const ROUTES_PER_RUN = Number(process.env.SCAN_ROUTES_PER_RUN || 40);
const DAILY_CAP = Number(process.env.VERIFY_DAILY_CAP || process.env.AMADEUS_DAILY_CAP || V.DEFAULT_DAILY_CAP); // appels de vérification / jour (SerpApi gratuit : 250/mois → 8/jour)
const EXPLORE_ORIGINS = ["PAR", "NCE", "LYS", "LON", "AMS", "BRU", "FRA", "MUC", "ZRH", "GVA", "MIL", "ROM", "MAD", "BCN", "LIS", "CPH", "STO", "DUB", "VIE", "IST"];
const EXPLORE_MARKETS = (process.env.EXPLORE_MARKETS || "fr,de,gb,es,it,tr,ae").split(",").map(x => x.trim()).filter(Boolean);
const VEILLE_PER_RUN = Number(process.env.VEILLE_PER_RUN || 2);   // annonces des sites de deals vérifiées par passage (prioritaires)
const VERIFY_PER_RUN = Number(process.env.VERIFY_PER_RUN || process.env.AMADEUS_PER_RUN || (V.NAME === "google" ? 2 : 4)); // nouveaux candidats vérifiés par passage
// Au-delà, un deal affiché est re-contrôlé. Avec Google Flights (8 vérifications/jour), une fois par
// jour suffit : chaque re-contrôle consomme le même budget que la découverte d'un nouveau deal.
const REVERIFY_HOURS = Number(process.env.SCAN_REVERIFY_HOURS || (V.NAME === "google" ? 20 : 8));
const DEAL_TTL_HOURS = 24;       // sans re-contrôle réussi, il disparaît
const MAX_DEALS = 12;
const RUN_BUDGET_MS = 45000;
const LOCK_SECONDS = 240;
const WATCH_ROUTES_PER_RUN = 30;  // routes suivies relues par passage
const DROP_PCT = 0.08;            // baisse minimale pour alerter (8 %)
const ALERT_GAP_HOURS = 12;       // pas plus d'une alerte par trajet et par personne sur cette durée

const nowISO = () => new Date().toISOString();
// Mois (AAAA-MM) à partir de la date donnée : "2027-01-20", 2 → ["2027-01", "2027-02"]
function monthsFrom(iso, count) {
  const out = [];
  let y = Number(String(iso).slice(0, 4)), m = Number(String(iso).slice(5, 7));
  for (let i = 0; i < count; i++) {
    out.push(y + "-" + String(m).padStart(2, "0"));
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
const hoursSince = iso => (Date.now() - Date.parse(iso || 0)) / 3600000;

module.exports = async (req, res) => {
  const q = req.query || {};
  const ua = String((req.headers && req.headers["user-agent"]) || "");
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = String((req.headers && req.headers.authorization) || "").trim();
  const fromCron = /vercel-cron/i.test(ua) && (!secret || auth === "Bearer " + secret);
  const allowed = fromCron || !secret || String(q.key || "").trim() === secret;
  if (!allowed) return D.sendJson(res, 401, { ok: false, error: "clé requise" });

  const token = process.env.TP_API_TOKEN;
  if (!token) return D.sendJson(res, 503, { ok: false, error: "TP_API_TOKEN manquant dans Vercel" });

  // La mémoire (Upstash) doit accepter l'écriture : sinon on explique au lieu de planter.
  let locked;
  try { locked = await S.lock("scan:lock", LOCK_SECONDS); }
  catch (e) {
    const msg = String(e && e.message || e);
    const hint = /403/.test(msg) ? "Upstash refuse l'écriture : le jeton Vercel UPSTASH_REDIS_REST_TOKEN est sans doute le jeton « Read-Only » ; remplacez-le par le jeton complet."
      : /401/.test(msg) ? "Upstash refuse le jeton : vérifiez UPSTASH_REDIS_REST_TOKEN dans Vercel."
      : "Mémoire Upstash injoignable : vérifiez UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN dans Vercel.";
    return D.sendJson(res, 503, { ok: false, error: "mémoire indisponible (" + msg + ")", hint });
  }
  if (!locked) return D.sendJson(res, 200, { ok: true, skipped: "un balayage est déjà en cours" });
  const started = Date.now();
  const deadline = started + RUN_BUDGET_MS;
  const log = { radar: null, reverified: 0, veille: null, discovered: 0, densified: 0, candidates: 0, verified: 0, rejected: [], errors: [] };

  try {
    // ---------- 1. radar ----------
    try {
      const rows = await radar.scan(token);
      await S.set("radar:snapshot", { at: nowISO(), routes: rows }, 6 * 3600);
      log.radar = rows.filter(r => r.count).length + "/" + rows.length;
    } catch (e) { log.errors.push("radar: " + (e.message || e)); }

    const day = D.todayISO();
    const budgetKey = "verify:used:" + day;
    let used = Number(await S.get(budgetKey)) || 0;
    const canVerify = () => V.ENABLED && used < DAILY_CAP && Date.now() < deadline;
    const spend = async () => { used += 1; await S.set(budgetKey, used, 48 * 3600); };

    let deals = (await S.get("deals:list")) || [];
    const today = D.todayISO();
    // ménage : départ passé ou preuve trop ancienne
    deals = deals.filter(d => d.dep > today && hoursSince(d.verifiedAt) < DEAL_TTL_HOURS);

    // ---------- 2. re-vérification des deals affichés ----------
    deals.sort((a, b) => Date.parse(a.verifiedAt) - Date.parse(b.verifiedAt));
    for (const d of deals) {
      if (hoursSince(d.verifiedAt) < REVERIFY_HOURS) continue;
      if (!canVerify()) break;
      await spend();
      const r = await V.search(d.from, d.to, d.dep, d.ret);
      log.reverified += 1;
      if (!r.ok) { log.errors.push(V.NAME + " " + d.id + ": " + r.error); continue; }
      const verdict = judge(d, r);
      if (verdict.ok) {
        if (r.price !== d.price) { d.prevPrice = d.price; d.changedAt = nowISO(); }
        Object.assign(d, verdict.fields, { price: r.price, verifiedAt: nowISO() });
        await pushHistory(d.id, r.price);
      } else {
        d._drop = verdict.reason;
        log.rejected.push(d.id + " (re-contrôle) : " + verdict.reason);
      }
    }
    deals = deals.filter(d => !d._drop);

    // ---------- 2b. veille : les annonces des sites de deals, vérifiées en priorité ----------
    // Chaque annonce (Travel-Dealz, Premium Flights, Fly4free, Dealabs…) devient un candidat avec le prix
    // annoncé ; on choisit une date (celle du cache Travelpayouts si la route y figure, sinon le début de la
    // période annoncée) et on demande à Google Flights. Même charte, même verdict que pour le cache.
    try {
      const veille = await VE.refresh(q.veille === "1");
      const done = (await S.get("veille:done")) || {};
      const shownIds = new Set(deals.map(d => d.id));
      const vlog = { sources: veille.sources, candidates: veille.candidates.length, tried: 0, verified: 0, rejected: [] };
      const queue = [];
      for (const c of veille.candidates) for (const o of c.origins.slice(0, c.generic ? 3 : 1)) {
        const id = o + "-" + c.to, key = id + "|" + c.price;
        if (o === c.to || shownIds.has(id) || (done[key] && done[key] > Date.now())) continue;
        queue.push({ id, key, from: o, to: c.to, announced: c.price, c });
      }
      queue.sort((a, b) => a.announced - b.announced);
      for (const v of queue) {
        if (vlog.tried >= VEILLE_PER_RUN || !canVerify()) break;
        // dates : cache TP sur la route (dans la période si connue), sinon période annoncée, sinon +45 j
        let dep = null, ret = null, distance = null, median = null;
        try {
          const r = await D.fetchLatest(token, v.from, v.to, false, { limit: 1000 });
          const rt = (r.ok ? r.offers : []).filter(o => o.ret && o.price > 0 && (!v.c.period || (o.dep >= v.c.period.start && o.dep <= v.c.period.end)));
          const st = C.stats(r.ok ? r.offers : []); distance = st.km || null; median = st.med || null;
          if (rt.length) { const best = rt.reduce((a, b) => (a.price <= b.price ? a : b)); dep = best.dep; ret = best.ret; }
        } catch (e) { /* sans cache */ }
        if (!distance) distance = await VE.distanceKm(v.from, v.to);
        if (!dep) {
          const base = v.c.period && v.c.period.start > D.todayISO() ? Date.parse(v.c.period.start) + 12 * 86400000 : Date.now() + 45 * 86400000;
          dep = new Date(base).toISOString().slice(0, 10); ret = new Date(base + 8 * 86400000).toISOString().slice(0, 10);
        }
        vlog.tried += 1; await spend();
        const r = await V.search(v.from, v.to, dep, ret);
        if (!r.ok) { log.errors.push(V.NAME + " veille " + v.id + ": " + r.error); done[v.key] = Date.now() + 24 * 3600 * 1000; continue; }
        const cand = { from: v.from, to: v.to, price: v.announced, median, distance, dates: 1, dep, ret, reasons: ["veille"] };
        const verdict = judge(cand, r);
        if (!verdict.ok) { vlog.rejected.push(v.id + " (" + v.c.srcName + ", annoncé " + v.announced + " €) : " + verdict.reason); done[v.key] = Date.now() + 3 * 24 * 3600 * 1000; continue; }
        const deal = Object.assign({
          id: v.id, from: v.from, to: v.to, dep, ret, median, distance, dates: 1, reasons: ["veille"],
          source: { name: v.c.srcName, link: v.c.link, announced: v.announced, deadline: v.c.deadline || null },
          foundAt: nowISO(), price: r.price, cachePrice: v.announced, verifiedAt: nowISO(), prevPrice: null, changedAt: null
        }, verdict.fields);
        deals.push(deal); shownIds.add(v.id); await pushHistory(v.id, r.price);
        vlog.verified += 1; log.verified += 1; done[v.key] = Date.now() + 7 * 24 * 3600 * 1000;
      }
      for (const k of Object.keys(done)) if (done[k] < Date.now()) delete done[k];
      await S.set("veille:done", done, 14 * 24 * 3600);
      log.veille = vlog;
    } catch (e) { log.errors.push("veille: " + (e && e.message || e)); }

    // ---------- 3. découverte (round-robin mondial) ----------
    const basket = C.basket();
    const diag = q.diag === "1";
    const cursor = diag && q.cursor ? Number(q.cursor) % basket.length : (Number(await S.get("scan:cursor")) || 0);
    const perRun = diag && q.n ? Math.min(150, Number(q.n) || ROUTES_PER_RUN) : ROUTES_PER_RUN;
    const slice = [];
    for (let i = 0; i < perRun; i++) slice.push(basket[(cursor + i) % basket.length]);
    await S.set("scan:cursor", (cursor + perRun) % basket.length);

    const results = await Promise.all(slice.map(async ([o, d]) => {
      try {
        const r = await D.fetchLatest(token, o, d, false, { limit: 1000 });
        if (!r.ok) return { route: [o, d], error: r.error };
        let offers = r.offers;
        let cand = C.evaluate([o, d], offers);
        let densified = false;
        // Prix dans la charte mais trop peu de dates en cache : on va chercher le
        // calendrier du mois (et du suivant) chez Travelpayouts avant d'écarter la route.
        const best = !cand && Date.now() < deadline ? C.promising([o, d], offers) : null;
        if (best) {
          const months = monthsFrom(best.dep, 2);
          const extra = await Promise.all(months.map(m => D.fetchMonthMatrix(token, o, d, false, m)));
          offers = D.mergeOffers([offers].concat(extra.filter(x => x.ok).map(x => x.offers)));
          cand = C.evaluate([o, d], offers);
          densified = true;
        }
        return { route: [o, d], candidate: cand, n: offers.length, densified, stats: diag ? C.stats(offers) : null };
      } catch (e) { return { route: [o, d], error: String(e.message || e) }; }
    }));
    log.discovered = results.filter(r => !r.error).length;
    log.densified = results.filter(r => r.densified).length;

    // ---------- 3c. exploration : « où partir en Business ? » depuis une origine, sur un marché tournant ----------
    // Le cache Travelpayouts est interrogé sans destination (toutes les directions connues), tour à tour sur les
    // marchés fr, de, gb, es, it, tr, ae : chaque marché voit des recherches différentes. Les destinations hors panier
    // qui passent la charte deviennent des candidats comme les autres (vérification Google Flights ensuite).
    try {
      const expo = (await S.get("scan:explore")) || { i: 0 };
      const origin = EXPLORE_ORIGINS[expo.i % EXPLORE_ORIGINS.length];
      const market = EXPLORE_MARKETS[Math.floor(expo.i / EXPLORE_ORIGINS.length) % EXPLORE_MARKETS.length];
      await S.set("scan:explore", { i: expo.i + 1, origin, market, at: nowISO() }, 7 * 24 * 3600);
      const ex = await D.fetchAnywhere(token, origin, market);
      const xlog = { origin, market, rows: ex.ok ? ex.rows.length : 0, error: ex.ok ? null : ex.error, promising: [] };
      if (ex.ok) {
        const seen = new Set(results.map(r => r.route.join("-")));
        const prom = ex.rows.filter(o => o.ret && o.distance >= C.LONG_HAUL_KM && o.price / o.distance < C.SEUIL_PAR_KM && o.to && o.to !== origin && !seen.has(origin + "-" + o.to))
          .sort((a, b) => a.price / a.distance - b.price / b.distance).slice(0, 6);
        for (const o of prom) {
          const r = await D.fetchLatest(token, origin, o.to, false, { limit: 1000 });
          const cand = r.ok ? C.evaluate([origin, o.to], r.offers) : null;
          xlog.promising.push(origin + "-" + o.to + " " + o.price + "€ " + Math.round(o.price / o.distance * 1000) / 1000 + "€/km" + (cand ? " CANDIDAT" : ""));
          if (cand) results.push({ route: [origin, o.to], candidate: Object.assign(cand, { reasons: cand.reasons.concat(["exploration " + market]) }), n: r.offers.length, explored: true });
        }
      }
      log.explore = xlog;
    } catch (e) { log.errors.push("exploration: " + (e && e.message || e)); }
    if (diag) log.diag = results.map(r => r.route.join("-") + ":" + (r.densified ? "+mois " : "") + (r.error ? "ERR " + r.error.slice(0, 40) : r.candidate ? "CANDIDAT " + r.candidate.price + "€ " + r.candidate.dates + "d " + (r.candidate.discount || "?") + "% " + (r.candidate.perKm || "?") + "€/km" : "non " + JSON.stringify(r.stats)));
    let candidates = results.map(r => r.candidate).filter(Boolean);
    // On ne ré-examine pas un deal déjà affiché et frais, ni une route refusée récemment.
    const shown = new Set(deals.map(d => d.id));
    const cooled = (await S.get("scan:cooldown")) || {};
    candidates = candidates.filter(c => !shown.has(c.from + "-" + c.to) && !(cooled[c.from + "-" + c.to] > Date.now()));
    candidates.sort((a, b) => b.score - a.score);
    log.candidates = candidates.length;
    // les candidats du jour restent consultables (diagnostic), même non vérifiés
    await S.set("scan:candidates", { at: nowISO(), list: candidates.slice(0, 30) }, 6 * 3600);

    // ---------- 4. vérification Amadeus des meilleurs candidats ----------
    let verifiedThisRun = 0;
    for (const c of candidates) {
      if (verifiedThisRun >= VERIFY_PER_RUN || !canVerify()) break;
      await spend();
      verifiedThisRun += 1;
      const r = await V.search(c.from, c.to, c.dep, c.ret);
      const id = c.from + "-" + c.to;
      if (!r.ok) { log.errors.push(V.NAME + " " + id + ": " + r.error); continue; }
      const verdict = judge(c, r);
      if (!verdict.ok) {
        log.rejected.push(id + " : " + verdict.reason);
        cooled[id] = Date.now() + 12 * 3600 * 1000; // pas de nouvelle vérification sur cette route avant 12 h
        continue;
      }
      const deal = Object.assign({
        id, from: c.from, to: c.to, dep: c.dep, ret: c.ret,
        median: c.median, distance: c.distance, dates: c.dates, reasons: c.reasons,
        foundAt: nowISO(), price: r.price, cachePrice: c.price, verifiedAt: nowISO(), prevPrice: null, changedAt: null
      }, verdict.fields);
      deals.push(deal);
      await pushHistory(id, r.price);
      log.verified += 1;
    }
    await S.set("scan:cooldown", cooled, 24 * 3600);

    // ---------- 5. trajets suivis par les visiteurs ----------
    try { log.watch = await watchRoutes(token, deadline); } catch (e) { log.errors.push("watch: " + (e.message || e)); }

    // ---------- publication ----------
    deals.sort((a, b) => scoreOf(b) - scoreOf(a));
    deals = deals.slice(0, MAX_DEALS);
    await S.set("deals:list", deals, 7 * 24 * 3600);
    await S.set("scan:last", { at: nowISO(), ms: Date.now() - started, log, verifier: V.NAME, verifyUsed: used, cap: DAILY_CAP, persistent: S.PERSISTENT }, 7 * 24 * 3600);

    return D.sendJson(res, 200, { ok: true, ms: Date.now() - started, deals: deals.length, basket: basket.length, cursor, verifier: { name: V.NAME, enabled: V.ENABLED, usedToday: used, cap: DAILY_CAP }, store: S.PERSISTENT ? "upstash" : "mémoire", log });
  } catch (e) {
    return D.sendJson(res, 500, { ok: false, error: String(e && e.message || e), log });
  } finally {
    await S.del("scan:lock").catch(() => {});
  }
};

// Le verdict de la charte sur une réponse du vérificateur (Google Flights ou Amadeus). c = candidat ou deal existant.
function judge(c, r) {
  if (!r.price) return { ok: false, reason: "aucun tarif Business trouvé en direct" };
  if (!r.allBusiness) return { ok: false, reason: "cabine mixte (un tronçon hors Business)" };
  const ref = c.price; // candidat : prix du cache ; deal affiché : dernier prix vérifié
  // Le prix vu doit rester un deal au sens de la charte (pas seulement proche du cache).
  const perKm = c.distance ? r.price / c.distance : null;
  const byKm = perKm !== null && c.distance >= C.LONG_HAUL_KM && perKm < C.SEUIL_PAR_KM;
  const discount = c.median ? 1 - r.price / c.median : null;
  const byMedian = discount !== null && discount >= C.DECOTE_MIN;
  if (r.price > ref * V.TOLERANCE && !byKm && !byMedian) return { ok: false, reason: `prix en direct ${r.price} € au lieu de ${ref} €` };
  if (!byKm && !byMedian) return { ok: false, reason: `prix en direct ${r.price} € : hors charte` };
  const seat = C.itinerarySeat(r.segments);
  const longHaul = (c.distance || 0) >= C.LONG_HAUL_KM;
  if (longHaul && seat.kind === "recliner") return { ok: false, reason: "long-courrier sans lit à plat (" + seat.detail + ")" };
  if (longHaul && seat.kind === "unknown") return { ok: false, reason: "appareil inconnu, lit à plat non garanti" };
  const air = D.AIRLINES[r.carrier] || {};
  return {
    ok: true,
    fields: {
      carrier: r.carrier, carrierName: air.name || r.carrier, carriers: r.carriers,
      aircraft: [...new Set(r.segments.map(s => s.aircraft).filter(Boolean))],
      stops: r.stops, seat, seats: r.seats,
      perKm: perKm !== null ? Math.round(perKm * 1000) / 1000 : null,
      discount: discount !== null ? Math.round(discount * 100) : null,
      link: D.aviasalesLink({ from: c.from, to: c.to, dep: c.dep, ret: c.ret, pax: 1, sub: D.SUB.deal })
    }
  };
}

// Relit les routes suivies (au plus WATCH_ROUTES_PER_RUN par passage, en tournant)
// et envoie une alerte à chaque personne dont le trajet a baissé.
async function watchRoutes(token, deadline) {
  const index = (await S.get("watch:index")) || [];
  if (!index.length) return { emails: 0, routes: 0, alerts: 0 };
  const watchers = [];
  for (const email of index) { const w = await S.get("watch:" + email); if (w && w.routes && w.routes.length) watchers.push(w); }
  const byRoute = new Map();
  for (const w of watchers) for (const r of w.routes) {
    const k = r.id + (r.oneway ? ":ow" : ":rt");
    if (!byRoute.has(k)) byRoute.set(k, { route: r, list: [] });
    byRoute.get(k).list.push(w);
  }
  const keys = [...byRoute.keys()].sort();
  const cursor = Number(await S.get("watch:cursor")) || 0;
  const todo = keys.length <= WATCH_ROUTES_PER_RUN ? keys : keys.slice(cursor, cursor + WATCH_ROUTES_PER_RUN).concat(keys.slice(0, Math.max(0, cursor + WATCH_ROUTES_PER_RUN - keys.length)));
  await S.set("watch:cursor", (cursor + WATCH_ROUTES_PER_RUN) % Math.max(1, keys.length));
  let alerts = 0;
  const changed = new Set();
  await Promise.all(todo.map(async k => {
    const { route, list } = byRoute.get(k);
    const r = await D.fetchLatest(token, route.from, route.to, !!route.oneway, { limit: 1000 }).catch(() => ({ ok: false, offers: [] }));
    if (!r.ok) return;
    const offers = r.offers.filter(o => route.oneway ? !o.ret : !!o.ret);
    if (!offers.length) return;
    const min = Math.min.apply(null, offers.map(o => o.price));
    const median = offers.length >= D.MIN_SAMPLES ? D.median(offers.map(o => o.price)) : null;
    for (const w of list) {
      const mine = w.routes.find(x => x.id === route.id && !!x.oneway === !!route.oneway);
      if (!mine) continue;
      const prev = mine.lastAlertPrice || mine.ref || null;
      const gapOk = !mine.lastAlert || hoursSince(mine.lastAlert) >= ALERT_GAP_HOURS;
      const drop = prev ? min <= prev * (1 - DROP_PCT) : true; // jamais de prix connu → premier tarif = alerte
      if (drop && gapOk && Date.now() < deadline) {
        const sent = await M.send(w.email, M.dropEmail(route, offers, min, prev, median, w.email, w.lang)).catch(() => ({ ok: false }));
        if (sent.ok) { mine.lastAlert = nowISO(); mine.lastAlertPrice = min; alerts += 1; }
      }
      mine.ref = min; mine.seenAt = nowISO(); changed.add(w.email);
    }
  }));
  for (const w of watchers) if (changed.has(w.email)) await S.set("watch:" + w.email, w);
  return { emails: watchers.length, routes: keys.length, checked: todo.length, alerts };
}

function scoreOf(d) {
  return (d.discount || 0) + (d.perKm && d.perKm < C.SEUIL_PAR_KM ? (C.SEUIL_PAR_KM - d.perKm) / C.SEUIL_PAR_KM * 100 : 0);
}

async function pushHistory(id, price) {
  const key = "deals:history:" + id;
  const h = (await S.get(key)) || [];
  const last = h[h.length - 1];
  if (!last || last.p !== price) h.push({ t: nowISO(), p: price });
  await S.set(key, h.slice(-60), 30 * 24 * 3600);
}
