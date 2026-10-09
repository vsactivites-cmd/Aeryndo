// Légendes : français d'abord, anglais ensuite, un seul appel à l'action, hashtags sobres.
// Ton du brief : vouvoiement, éditorial, pas d'émojis en rafale, date du constat, siège en clair.
const { fmtEUR, fmtEURen, fmtDay, fmtDate } = require("./content.js");

const TAGS = {
  fr: ["#classeaffaires", "#businessclass", "#voldeluxe", "#voyagedeluxe", "#litaplat", "#aeryndo"],
  en: ["#businessclassdeals", "#luxurytravel", "#flightdeals", "#lieflat"]
};
function tags(c) { const city = (c.city && c.city.en || c.cityCode || "").toLowerCase().replace(/[^a-z]/g, ""); const extra = city ? ["#" + city] : []; return TAGS.fr.concat(extra, TAGS.en).join(" "); }

function dealCaption(c) {
  const fr = c.live
    ? `${c.city.fr} en Business, ${fmtEUR(c.price)} l’aller-retour. Vérifié sur Google Flights le ${fmtDay(c.verifiedAt.slice(0, 10), "fr")}.

${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.fr}. ${c.seat.fr}.
Dates : ${fmtDay(c.dep, "fr")} → ${fmtDay(c.ret, "fr")}. Prix par adulte, taxes comprises${c.was ? ", soit " + c.discount + " % sous le tarif habituel de la route (" + fmtEUR(c.was) + ")" : ""}.

Ce tarif peut disparaître dans la journée. Pour le réserver — et recevoir les suivants avant tout le monde — le lien est en bio.`
    : `${c.city.fr} en Business, ${fmtEUR(c.price)} l’aller-retour. Déniché le ${fmtDate(c.foundAt, "fr")}.

${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.fr}. ${c.seat.fr}
Prix total par adulte vu à l’écran de paiement, ${c.discount} % sous le tarif habituel de la route (${fmtEUR(c.was)}).

Ce tarif a disparu depuis. C’est le principe : les meilleurs deals Business partent en quelques heures. Le prochain, vous le recevrez avant tout le monde — lien en bio.`;
  const en = c.live
    ? `${c.city.en} in Business, ${fmtEURen(c.price)} round trip. Verified on Google Flights on ${fmtDay(c.verifiedAt.slice(0, 10), "en")}.
${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.en}. ${c.seat.en}. ${fmtDay(c.dep, "en")} → ${fmtDay(c.ret, "en")}, per adult, taxes included. This fare can vanish within the day — link in bio to book and to get the next ones first.`
    : `${c.city.en} in Business, ${fmtEURen(c.price)} round trip. Found on ${fmtDate(c.foundAt, "en")}.
${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.en}. ${c.seat.en} Total price per adult seen on the payment screen, ${c.discount}% below the route’s usual fare. Gone now — the next one reaches you first, link in bio.`;
  return `${fr}\n\n—\n\n${en}\n\n${tags(c)}`;
}

function piegeCaption(c) {
  const fr = `Le piège de la semaine — ${c.title.fr}

${c.hook.fr}
${c.detail.fr}

${c.body.fr}

${c.lesson.fr} Lien en bio.`;
  const en = `This week’s trap — ${c.title.en}
${c.hook.en} ${c.detail.en}
${c.body.en}
${c.lesson.en} Link in bio.`;
  return `${fr}\n\n—\n\n${en}\n\n#piegedelasemaine ${tags(c)}`;
}

function reelCaption(c) {
  const fr = c.live
    ? `${c.city.fr} en Business à ${fmtEUR(c.price)} — vérifié le ${fmtDay(c.verifiedAt.slice(0, 10), "fr")}. ${c.seat.fr}. Lien en bio avant qu’il ne parte.`
    : `${c.city.fr} en Business à ${fmtEUR(c.price)} — déniché le ${fmtDate(c.foundAt, "fr")}. ${c.seat.fr} Le prochain, vous le recevrez avant tout le monde : lien en bio.`;
  const en = c.live
    ? `${c.city.en} in Business for ${fmtEURen(c.price)} — verified ${fmtDay(c.verifiedAt.slice(0, 10), "en")}. ${c.seat.en}. Link in bio before it goes.`
    : `${c.city.en} in Business for ${fmtEURen(c.price)} — found on ${fmtDate(c.foundAt, "en")}. ${c.seat.en} The next one reaches you first: link in bio.`;
  return `${fr}\n\n—\n\n${en}\n\n${tags(c)} #reels`;
}

function caption(slot, c) {
  if (slot.id === "piege") return piegeCaption(c);
  if (slot.id === "reel") return reelCaption(c);
  return dealCaption(c);
}

module.exports = { caption, dealCaption, piegeCaption, reelCaption };
