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
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key },
    body: JSON.stringify({ sender: FROM, to: [{ email: to }], subject, htmlContent: html })
  });
  return { ok: resp.ok, status: resp.status };
}

module.exports = { routeEmail, dropEmail, send, sig, unsubLink, lang };
