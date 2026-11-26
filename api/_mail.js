// ============================================================
// AERYNDO — emails transactionnels (Brevo) : trajet suivi, baisse de prix
// Variables Vercel : BREVO_API_KEY (déjà en place), CRON_SECRET (signe le lien de désinscription)
// Zéro dépendance npm.
// ============================================================
const crypto = require("crypto");
const D = require("./_data.js");

const SITE = "https://aeryndo.co";
const FROM = { name: "Aeryndo", email: "contact@aeryndo.co" };

const T = {
  fr: {
    subjRoute: (r) => `Vos tarifs Business ${r.from} → ${r.to} — et on surveille pour vous`,
    subjDrop: (r, p) => `Baisse de prix : ${r.from} → ${r.to} en Business à ${euros(p)}`,
    kicker: "VOTRE TRAJET SUIVI", kickerDrop: "ALERTE PRIX",
    introRoute: (r, n) => n ? `Voici les ${n} meilleurs tarifs Business actuellement repérés sur <b>${r.from} → ${r.to}</b>${r.oneway ? " (aller simple)" : " (aller-retour)"}. On surveille cette route pour vous : dès que le prix baisse, vous recevez un email.` : `Aucun tarif Business n'est en cache aujourd'hui sur <b>${r.from} → ${r.to}</b>. On surveille cette route pour vous : dès qu'un tarif apparaît ou baisse, vous recevez un email.`,
    introDrop: (r, p, prev) => `Le meilleur tarif Business sur <b>${r.from} → ${r.to}</b> vient de passer à <b>${euros(p)}</b>${prev ? ` (il était à ${euros(prev)})` : ""}. Les tarifs bougent vite : vérifiez et réservez si les dates vous vont.`,
    perAdult: "par adulte", direct: "direct", stops1: "1 escale", stopsN: (n) => `${n} escales`, book: "Réserver →",
    median: (m) => `Médiane de la route : ${euros(m)}`, unsub: "Ne plus suivre ce trajet", legal: "Prix vus par nos partenaires (Aviasales) au moment de l'envoi, par adulte, susceptibles de changer. Liens partenaires — même prix pour vous."
  },
  en: {
    subjRoute: (r) => `Your Business fares ${r.from} → ${r.to} — we're watching this route for you`,
    subjDrop: (r, p) => `Price drop: ${r.from} → ${r.to} in Business at ${euros(p)}`,
    kicker: "YOUR TRACKED ROUTE", kickerDrop: "PRICE ALERT",
    introRoute: (r, n) => n ? `Here are the ${n} best Business fares currently spotted on <b>${r.from} → ${r.to}</b>${r.oneway ? " (one way)" : " (round trip)"}. We're watching this route for you: as soon as the price drops, you get an email.` : `No Business fare is cached today on <b>${r.from} → ${r.to}</b>. We're watching this route for you: as soon as a fare appears or drops, you get an email.`,
    introDrop: (r, p, prev) => `The best Business fare on <b>${r.from} → ${r.to}</b> just dropped to <b>${euros(p)}</b>${prev ? ` (it was ${euros(prev)})` : ""}. Fares move fast: check and book if the dates suit you.`,
    perAdult: "per adult", direct: "nonstop", stops1: "1 stop", stopsN: (n) => `${n} stops`, book: "Book →",
    median: (m) => `Route median: ${euros(m)}`, unsub: "Stop tracking this route", legal: "Fares seen by our partners (Aviasales) at send time, per adult, subject to change. Partner links — same price for you."
  }
};
function euros(n) { return Number(n).toLocaleString("fr-FR") + " €"; }
function lang(l) { return T[l] ? l : "en"; }
function fmtDate(iso, l) {
  try { return new Intl.DateTimeFormat(l === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00")); } catch (e) { return iso; }
}

// Lien de désinscription signé (pas de base de comptes, pas de mot de passe).
function sig(email) {
  const secret = (process.env.CRON_SECRET || "aeryndo").trim();
  return crypto.createHmac("sha256", secret).update(String(email).toLowerCase()).digest("hex").slice(0, 24);
}
function unsubLink(email, routeId) {
  const e = Buffer.from(String(email).toLowerCase()).toString("base64url");
  return `${SITE}/api/subscribe?stop=${e}&sig=${sig(email)}${routeId ? "&route=" + encodeURIComponent(routeId) : ""}`;
}

function rows(route, offers, l, sub) {
  const t = T[l];
  return offers.map(o => {
    const link = D.aviasalesLink({ from: route.from, to: route.to, dep: o.dep, ret: o.ret, pax: 1, sub });
    const stops = o.changes === 0 ? t.direct : o.changes === 1 ? t.stops1 : o.changes > 1 ? t.stopsN(o.changes) : "";
    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a2e;">
          <div style="font-size:16px;color:#F3F0E9;">${fmtDate(o.dep, l)}${o.ret ? " → " + fmtDate(o.ret, l) : ""}</div>
          <div style="font-size:12px;color:#b8b3aa;margin-top:3px;letter-spacing:.06em;text-transform:uppercase;">${stops}</div>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a2e;text-align:right;white-space:nowrap;">
          <div style="font-size:20px;color:#F3F0E9;">${euros(o.price)}</div>
          <div style="font-size:11px;color:#8f8a82;">${t.perAdult}</div>
          <a href="${link}" style="font-size:12px;color:#FF6B57;text-decoration:none;">${t.book}</a>
        </td>
      </tr>`;
  }).join("");
}

function shell({ kicker, intro, table, footer, l }) {
  return `
  <div style="background:#0E0E0F;padding:32px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="font-size:22px;letter-spacing:4px;color:#F3F0E9;">AERYNDO</div>
      <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin:6px 0 24px;">${kicker}</div>
      <p style="color:#b8b3aa;font-size:14px;line-height:1.6;margin:0 0 18px;">${intro}</p>
      ${table ? `<table style="width:100%;border-collapse:collapse;background:#161516;">${table}</table>` : ""}
      <p style="color:#8f8a82;font-size:11px;line-height:1.6;margin-top:20px;">${footer}</p>
    </div>
  </div>`;
}

// Email envoyé juste après une recherche suivie : les meilleurs tarifs du moment.
function routeEmail(route, offers, median, email, l) {
  l = lang(l); const t = T[l];
  const top = offers.slice().sort((a, b) => a.price - b.price).slice(0, 8);
  const footer = [median ? t.median(median) : "", t.legal, `<a href="${unsubLink(email, route.id)}" style="color:#8f8a82;">${t.unsub}</a>`].filter(Boolean).join(" · ");
  return { subject: t.subjRoute(route), html: shell({ kicker: t.kicker, intro: t.introRoute(route, top.length), table: rows(route, top, l, "route-mail"), footer, l }) };
}

// Email envoyé par le robot quand le meilleur tarif de la route baisse.
function dropEmail(route, offers, price, prev, median, email, l) {
  l = lang(l); const t = T[l];
  const top = offers.slice().sort((a, b) => a.price - b.price).slice(0, 5);
  const footer = [median ? t.median(median) : "", t.legal, `<a href="${unsubLink(email, route.id)}" style="color:#8f8a82;">${t.unsub}</a>`].filter(Boolean).join(" · ");
  return { subject: t.subjDrop(route, price), html: shell({ kicker: t.kickerDrop, intro: t.introDrop(route, price, prev), table: rows(route, top, l, "alert-mail"), footer, l }) };
}

async function send(to, { subject, html }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, error: "BREVO_API_KEY manquant" };
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({ sender: FROM, to: [{ email: to }], subject, htmlContent: html }), signal: ctrl.signal
    });
    if (!resp.ok) console.error("Brevo email HTTP " + resp.status + " pour " + to.replace(/(.).+(@.*)/, "$1…$2"));
    return { ok: resp.ok, status: resp.status };
  } catch (e) { console.error("Brevo email : " + (e && e.message || e)); return { ok: false, error: String(e && e.message || e) }; }
  finally { clearTimeout(timer); }
}

// ============================================================
// v10 (25 nov. 2026) — « le deal + le refusé » : email de bienvenue (inscription sans trajet) et
// digest du vendredi à toute la liste. Architecture du message : émotion → chiffre → preuve.
// Chaque deal porte son propre sub_id Travelpayouts (mail-welcome / mail-weekly) : on saura ce que l'email rapporte.
// ============================================================
const T2 = {
  fr: {
    subjWelcome: "Bienvenue — vous ne payez plus le prix affiché",
    subjWeekly: (d, city) => d ? `${city} en Business à ${euros(d.price)}${d.savings ? ` (vous gardez ${euros(d.savings)})` : ""} — et ce qu’on a refusé` : "Le deal de la semaine — et ce qu’on a refusé",
    kickerWelcome: "BIENVENUE CHEZ AERYNDO", kickerWeekly: "LE DEAL DE LA SEMAINE",
    introWelcome: `La porte se ferme, le siège devient un lit, et vous n’avez pas payé le prix affiché. C’est ce qu’on cherche pour vous, chaque jour : des tarifs Business <b>vus à l’écran de paiement</b>, le siège décrit tronçon par tronçon, et tout ce qui ne tient pas est refusé. Voici ce qui passe le filtre en ce moment.`,
    introWeekly: `Chaque vendredi : les tarifs Business qui ont passé la vérification cette semaine — et ceux qu’on a refusés, avec le motif. Un prix annoncé n’est pas un prix payé.`,
    dealsH: "Vérifiés cette semaine", refusedH: "Refusés cette semaine", readH: "À lire",
    was: w => `au lieu de ${euros(w)}`, keep: s => `vous gardez ${euros(s)}`, left: n => n <= 1 ? "dernier jour à ce tarif" : `encore ${n} jours à ce tarif`,
    seat: { flat: "lit à plat", partial: "lit à plat sur le long-courrier", recliner: "siège inclinable" },
    verified: iso => `vu à l’écran de paiement le ${fmtDate(iso.slice(0, 10), "fr")}`,
    stops: n => n === 0 ? "direct" : n === 1 ? "1 escale" : `${n} escales`,
    refusedNote: "Vus sur les sites de deals ou dans le cache des comparateurs, vérifiés à l’écran de paiement, jamais publiés.",
    none: "Rien n’a passé le filtre cette semaine : on ne publie pas pour publier. Les deals vérifiés restent sur aeryndo.co.",
    cta: "Tous les deals vérifiés →", unsubAll: "Ne plus recevoir ces emails",
    whyH: "Notre promesse",
    why: "On connaît la fatigue des comparateurs, la peur de la mauvaise cabine, le prix qui change au moment de payer. Alors on cherche à votre place, chaque jour, sur des dizaines de routes, et on vérifie tout à l’écran de paiement. Notre promesse : jamais un prix que nous n’avons pas vu, jamais un siège que nous n’avons pas contrôlé tronçon par tronçon — et quand un tarif part, on vous le dit. Le bouton Réserver ouvre exactement le vol vérifié, mêmes dates, même cabine, même prix que chez le vendeur ; réserver par ce lien garde Aeryndo gratuit.",
    legal: "Prix par adulte, taxes comprises, vus à l’écran de paiement au moment de la vérification ; ils peuvent changer à tout moment. Liens partenaires : si vous réservez, nous pouvons percevoir une commission, au même prix pour vous. Aeryndo · AURUM GLOBAL HOLDING."
  },
  en: {
    subjWelcome: "Welcome — you no longer pay the advertised fare",
    subjWeekly: (d, city) => d ? `${city} in Business for ${euros(d.price)}${d.savings ? ` (you keep ${euros(d.savings)})` : ""} — and what we refused` : "This week’s deal — and what we refused",
    kickerWelcome: "WELCOME TO AERYNDO", kickerWeekly: "THE DEAL OF THE WEEK",
    introWelcome: `The door closes, the seat becomes a bed, and you did not pay the advertised fare. That is what we hunt for you, every day: Business fares <b>seen at checkout</b>, the seat described leg by leg, and anything that fails is refused. Here is what passes the filter right now.`,
    introWeekly: `Every Friday: the Business fares that passed verification this week — and the ones we refused, with the reason. An advertised fare is not a paid fare.`,
    dealsH: "Verified this week", refusedH: "Refused this week", readH: "Worth reading",
    was: w => `instead of ${euros(w)}`, keep: s => `you keep ${euros(s)}`, left: n => n <= 1 ? "last day at this fare" : `${n} days left at this fare`,
    seat: { flat: "flat bed", partial: "flat bed on the long haul", recliner: "recliner" },
    verified: iso => `seen at checkout on ${fmtDate(iso.slice(0, 10), "en")}`,
    stops: n => n === 0 ? "nonstop" : n === 1 ? "1 stop" : `${n} stops`,
    refusedNote: "Seen on deal sites or in fare caches, verified at checkout, never published.",
    none: "Nothing passed the filter this week: we do not publish for the sake of it. Verified deals stay on aeryndo.co.",
    cta: "All verified deals →", unsubAll: "Stop receiving these emails",
    whyH: "Our promise",
    why: "We know the comparator fatigue, the fear of the wrong cabin, the price that changes at payment. So we search for you, every day, across dozens of routes, and verify everything at checkout. Our promise: never a fare we have not seen, never a seat we have not checked leg by leg — and when a fare goes, we tell you. The Book button opens exactly the verified flight, same dates, same cabin, same price as at the seller; booking through it keeps Aeryndo free.",
    legal: "Prices per adult, taxes included, seen at checkout at verification time; they can change at any moment. Partner links: if you book, we may earn a commission, at the same price for you. Aeryndo · AURUM GLOBAL HOLDING."
  }
};
const READ = [
  { id: "prix-business", fr: "Ce que coûte vraiment un billet Business — et à partir de quand c’est un deal", en: "What a Business ticket really costs — and when it becomes a deal" },
  { id: "cabines", fr: "Lit à plat, fauteuil inclinable, « Business » sur un 737 : le guide des cabines", en: "Flat bed, recliner, “Business” on a 737: a guide to the cabins" }
];
const daysLeft = iso => iso ? Math.max(0, Math.round((Date.parse(iso + "T23:59:59Z") - Date.now()) / 86400000)) : null;
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mailLink = (link, sub) => String(link || "").replace(/marker=745122(\.[a-z0-9-]+)?/, "marker=745122." + sub);

function dealRows(deals, names, l, sub) {
  const t = T2[l];
  return deals.map(d => {
    const city = (names[d.to] && names[d.to][l]) || d.to, from = (names[d.from] && names[d.from][l]) || d.from;
    const seat = d.seat && t.seat[d.seat.kind] ? t.seat[d.seat.kind] : "";
    const left = daysLeft(d.deadline);
    const meta = [d.carrierName || d.carrier, d.aircraft && d.aircraft.length ? d.aircraft.join("/") : "", t.stops(d.stops), seat].filter(Boolean).join(" · ");
    const sub2 = [d.was || d.median ? t.was(d.was || d.median) : "", d.savings ? t.keep(d.savings) : "", left != null ? t.left(left) : ""].filter(Boolean).join(" · ");
    return `
      <tr>
        <td style="padding:16px 16px;border-bottom:1px solid #2a2a2e;vertical-align:top;">
          <div style="font-size:18px;color:#F3F0E9;">${esc(from)} → <b>${esc(city)}</b></div>
          <div style="font-size:13px;color:#b8b3aa;margin-top:4px;">${fmtDate(d.dep, l)}${d.ret ? " → " + fmtDate(d.ret, l) : ""} · ${esc(meta)}</div>
          <div style="font-size:11px;color:#8f8a82;margin-top:4px;letter-spacing:.04em;">${esc(t.verified(d.verifiedAt || new Date().toISOString()))}</div>
        </td>
        <td style="padding:16px 16px;border-bottom:1px solid #2a2a2e;text-align:right;white-space:nowrap;vertical-align:top;">
          <div style="font-size:22px;color:#F3F0E9;">${euros(d.price)}</div>
          ${sub2 ? `<div style="font-size:11px;color:#FF6B57;margin-top:3px;">${esc(sub2)}</div>` : ""}
          <a href="${mailLink(d.link, sub)}" style="display:inline-block;margin-top:8px;font-size:12px;color:#FF6B57;text-decoration:none;border:1px solid #FF6B57;border-radius:6px;padding:6px 10px;">${T[l].book}</a>
        </td>
      </tr>`;
  }).join("");
}

// kind : "welcome" | "weekly" ; deals : liste du site (deals:list) ; refused : journal scan:refused ; names : { CODE: {fr,en} }
function dealsEmail({ kind, deals, refused, names, email, l }) {
  l = lang(l); const t = T2[l];
  const RF = require("./_refus.js");
  const top = (deals || []).slice().sort((a, b) => (b.savings || 0) - (a.savings || 0) || (a.perKm || 9) - (b.perKm || 9)).slice(0, kind === "welcome" ? 4 : 5);
  const ref = RF.pick(refused, 3);
  const first = top[0], firstCity = first ? ((names[first.to] && names[first.to][l]) || first.to) : "";
  const table = top.length ? dealRows(top, names || {}, l, kind === "welcome" ? "mail-welcome" : "mail-weekly") : "";
  const refusedHtml = ref.length ? `
      <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin:28px 0 6px;">${t.refusedH.toUpperCase()}</div>
      <p style="color:#8f8a82;font-size:12px;line-height:1.5;margin:0 0 10px;">${t.refusedNote}</p>
      ${ref.map(r => `<div style="padding:9px 0;border-bottom:1px solid #2a2a2e;font-size:14px;color:#F3F0E9;line-height:1.45;"><span style="color:#FF6B57;">✕</span> ${esc((names[r.from] && names[r.from][l]) || r.from)} → ${esc((names[r.to] && names[r.to][l]) || r.to)}${r.src ? ` <span style="color:#8f8a82;">(${esc(r.src)})</span>` : ""} : ${esc(r.reason[l])}.</div>`).join("")}` : "";
  const readHtml = `
      <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin:28px 0 8px;">${t.readH.toUpperCase()}</div>
      ${READ.map(a => `<div style="padding:7px 0;font-size:14px;"><a href="${SITE}${l === "fr" ? "" : "/" + l}/journal/${a.id}" style="color:#F3F0E9;text-decoration:none;border-bottom:1px solid #3a3a3e;">${esc(a[l])}</a></div>`).join("")}`;
  const body = `
  <div style="background:#0E0E0F;padding:32px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="font-size:22px;letter-spacing:4px;color:#F3F0E9;">AERYNDO</div>
      <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin:6px 0 24px;">${kind === "welcome" ? t.kickerWelcome : t.kickerWeekly}</div>
      <p style="color:#b8b3aa;font-size:15px;line-height:1.6;margin:0 0 18px;">${kind === "welcome" ? t.introWelcome : t.introWeekly}</p>
      <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin:0 0 6px;">${t.dealsH.toUpperCase()}</div>
      ${table ? `<table style="width:100%;border-collapse:collapse;background:#161516;">${table}</table>` : `<p style="color:#b8b3aa;font-size:14px;line-height:1.6;">${t.none}</p>`}
      <p style="margin:16px 0 0;"><a href="${SITE}/#deals" style="font-size:13px;color:#FF6B57;text-decoration:none;">${t.cta}</a></p>
      <div style="margin:26px 0 0;padding:16px 18px;border:1px solid #2a2a2e;border-radius:10px;background:#131315;">
        <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin-bottom:6px;">${t.whyH.toUpperCase()}</div>
        <p style="color:#b8b3aa;font-size:13px;line-height:1.6;margin:0;">${t.why}</p>
      </div>
      ${refusedHtml}
      ${readHtml}
      <p style="color:#8f8a82;font-size:11px;line-height:1.6;margin-top:28px;">${t.legal} · <a href="${unsubLink(email)}" style="color:#8f8a82;">${t.unsubAll}</a></p>
    </div>
  </div>`;
  return { subject: kind === "welcome" ? t.subjWelcome : t.subjWeekly(first, firstCity), html: body };
}

module.exports = { routeEmail, dropEmail, dealsEmail, send, sig, unsubLink, lang };
