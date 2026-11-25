// Légendes (v10-com, 24 nov. 2026) : français d'abord, anglais ensuite, un seul appel à l'action, hashtags sobres.
// Architecture du message (doc « positionnement-cible-campagne-deux-prix ») — ordre fixe dans chaque légende :
//   1. l'émotion (l'arrivée reposée, la porte qui se ferme — ce que la lectrice s'offre),
//   2. le chiffre (le prix, le tarif habituel de la route, ce qu'elle garde, le temps qu'il reste),
//   3. la preuve (vu à l'écran de paiement, vérifié sur Google Flights à telle date, le siège tronçon par tronçon).
// Ton : vouvoiement, premium, précis ; jamais « pas cher », « promo », « bon plan » dans la voix de la marque.
const { fmtEUR, fmtEURen, fmtDay, fmtDate } = require("./content.js");

const TAGS = {
  fr: ["#classeaffaires", "#businessclass", "#voldeluxe", "#voyagedeluxe", "#litaplat", "#aeryndo"],
  en: ["#businessclassdeals", "#luxurytravel", "#flightdeals", "#lieflat"]
};
// Mention légale (loi du 9 juin 2023 sur l'influence commerciale) : nos liens de réservation sont des liens
// partenaires rémunérés → chaque légende se termine par #publicité (choix de Valentyna, 23 oct. 2026) et #ad pour l'anglais.
const LEGAL = "#publicité #ad";
// La raison unique (règle de Valentyna, 25 nov. 2026) : chaque contenu dit pourquoi réserver par Aeryndo — sans
// se comparer à personne, en donnant envie. Toujours les mêmes phrases, toujours présentes.
const WHY = {
  fr: `Pourquoi réserver par Aeryndo ? Le lien ouvre exactement le vol vérifié — mêmes dates, même cabine, même prix que chez le vendeur, rien à rechercher. Le prix a été vu à l’écran de paiement, le siège contrôlé tronçon par tronçon. Et réserver par ce lien garde Aeryndo gratuit.`,
  en: `Why book through Aeryndo? The link opens exactly the verified flight — same dates, same cabin, same price as at the seller, nothing to search again. The fare was seen at checkout, the seat checked leg by leg. And booking through it keeps Aeryndo free.`
};
// Instagram : 2 200 caractères maximum. On assemble FR + raison + EN + raison + hashtags, et si c'est trop long
// on sacrifie d'abord la raison en anglais, puis on raccourcit la partie anglaise (le français reste intact).
const LIMIT = 2150;
function assemble(fr, en, tagLine) {
  const full = (e, w) => `${fr}\n\n${WHY.fr}\n\n—\n\n${e}${w ? "\n" + WHY.en : ""}\n\n${tagLine}`;
  if (full(en, true).length <= LIMIT) return full(en, true);
  if (full(en, false).length <= LIMIT) return full(en, false);
  const room = LIMIT - full("", false).length;
  const cut = en.length > room ? en.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "…" : en;
  return full(cut, false);
}
function tags(c) { const city = (c.city && c.city.en || c.cityCode || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, ""); const extra = city ? ["#" + city] : []; return TAGS.fr.concat(extra, TAGS.en).join(" ") + " " + LEGAL; }
// « 16 oct. » + « . » → une seule ponctuation finale
const dot = s => String(s).replace(/\.$/, "") + ".";
const daysLeft = iso => iso ? Math.max(0, Math.round((Date.parse(iso + "T23:59:59") - Date.now()) / 86400000)) : null;
const hours = min => min ? (min >= 60 ? Math.round(min / 60) + " h" : min + " min") : null;

// L'ouverture émotionnelle varie avec le siège : un vrai lit du décollage à l'arrivée, ou un lit sur le long-courrier.
function feeling(c, L) {
  const flat = c.seatKind === "flat";
  if (L === "fr") return flat
    ? "La porte se ferme, le siège devient un lit, et vous n’avez pas payé le prix affiché."
    : "Vous dormez à plat sur le long-courrier, vous arrivez en forme, et vous n’avez pas payé le prix affiché.";
  return flat
    ? "The door closes, the seat becomes a bed, and you did not pay the advertised fare."
    : "You sleep flat on the long haul, land rested, and you did not pay the advertised fare.";
}

function dealCaption(c) {
  const left = daysLeft(c.deadline), dur = hours(c.flightMinutes);
  const figureFr = `${c.city.fr} en Business : ${fmtEUR(c.price)} l’aller-retour` + (c.was ? `, quand cette route se paie d’ordinaire ${fmtEUR(c.was)}` : "") + "." + (c.savings ? ` Vous gardez ${fmtEUR(c.savings)}.` : "");
  const figureEn = `${c.city.en} in Business: ${fmtEURen(c.price)} round trip` + (c.was ? `, on a route that usually costs ${fmtEURen(c.was)}` : "") + "." + (c.savings ? ` You keep ${fmtEURen(c.savings)}.` : "");
  const fr = c.live
    ? `${feeling(c, "fr")}

${figureFr}

La preuve : prix total par adulte, taxes comprises, vu à l’écran de paiement et vérifié sur Google Flights le ${dot(fmtDay(c.verifiedAt.slice(0, 10), "fr"))}
${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.fr}${dur ? " · " + dur + " de vol" : ""}. ${dot(c.seat.fr)}
Dates : ${fmtDay(c.dep, "fr")} → ${dot(fmtDay(c.ret, "fr"))}${left != null ? (left <= 1 ? " Dernier jour pour réserver à ce tarif." : ` Il reste ${left} jours pour réserver à ce tarif.`) : " Ce tarif peut disparaître dans la journée."}

Le lien de réservation est en bio — et les prochains deals vous arrivent avant tout le monde.`
    : `${c.city.fr} en Business à ${fmtEUR(c.price)} l’aller-retour${c.was ? `, au lieu de ${fmtEUR(c.was)} d’ordinaire` : ""}. Déniché le ${dot(fmtDate(c.foundAt, "fr"))}${c.savings ? ` Celles et ceux qui l’ont vu à temps ont gardé ${fmtEUR(c.savings)}.` : ""}

${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.fr}. ${dot(c.seat.fr)}
Prix total par adulte, taxes comprises, vu à l’écran de paiement${c.discount ? `, ${c.discount} % sous le tarif habituel de la route` : ""}.

Ce tarif a disparu${c.livedDays ? ` au bout de ${c.livedDays} jour${c.livedDays > 1 ? "s" : ""}` : ""}. C’est le principe : les meilleurs tarifs Business vivent quelques heures. Le prochain, vous le recevrez avant tout le monde — lien en bio.`;
  const en = c.live
    ? `${feeling(c, "en")}
${figureEn}
The proof: total price per adult, taxes included, seen at checkout and verified on Google Flights on ${dot(fmtDay(c.verifiedAt.slice(0, 10), "en"))} ${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.en}${dur ? " · " + dur + " flying" : ""}. ${dot(c.seat.en)} ${fmtDay(c.dep, "en")} → ${dot(fmtDay(c.ret, "en"))}${left != null ? (left <= 1 ? " Last day to book at this fare." : ` ${left} days left to book at this fare.`) : " This fare can vanish within the day."} Booking link in bio — and the next deals reach you first.`
    : `${c.city.en} in Business for ${fmtEURen(c.price)} round trip${c.was ? `, instead of the usual ${fmtEURen(c.was)}` : ""}. Found on ${dot(fmtDate(c.foundAt, "en"))}${c.savings ? ` Those who saw it in time kept ${fmtEURen(c.savings)}.` : ""}
${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops.en}. ${dot(c.seat.en)} Total price per adult seen at checkout${c.discount ? `, ${c.discount}% below the route’s usual fare` : ""}. Gone now${c.livedDays ? ` after ${c.livedDays} day${c.livedDays > 1 ? "s" : ""}` : ""} — the next one reaches you first, link in bio.`;
  return assemble(fr, en, tags(c));
}

function piegeCaption(c) {
  const fr = `Vous auriez cliqué. Nous aussi, presque.

${c.hook.fr}
${c.detail.fr}

${c.body.fr}

${c.lesson.fr} Ce vol n’a pas été publié sur aeryndo.co — c’est à ça que sert la vérification. Lien en bio.`;
  const en = `You would have clicked. So would we, almost.
${c.hook.en} ${c.detail.en}
${c.body.en}
${c.lesson.en} This flight was never published on aeryndo.co — that is what verification is for. Link in bio.`;
  return assemble(fr, en, "#piegedelasemaine " + tags(c));
}

function reelCaption(c) {
  const fr = c.live
    ? `La Business n’est pas réservée à ceux qui ne regardent pas le prix. ${c.city.fr}, lit à plat, ${fmtEUR(c.price)} l’aller-retour${c.was ? ` au lieu de ${fmtEUR(c.was)}` : ""} — vérifié à l’écran de paiement le ${dot(fmtDay(c.verifiedAt.slice(0, 10), "fr"))} ${dot(c.seat.fr)} Lien en bio avant qu’il ne parte.`
    : `La Business n’est pas réservée à ceux qui ne regardent pas le prix. ${c.city.fr}, lit à plat, ${fmtEUR(c.price)} l’aller-retour${c.was ? ` au lieu de ${fmtEUR(c.was)}` : ""} — déniché le ${dot(fmtDate(c.foundAt, "fr"))} ${dot(c.seat.fr)} Le prochain, vous le recevrez avant tout le monde : lien en bio.`;
  const en = c.live
    ? `Business Class is not reserved for people who don’t look at the price. ${c.city.en}, flat bed, ${fmtEURen(c.price)} round trip${c.was ? ` instead of ${fmtEURen(c.was)}` : ""} — verified at checkout on ${dot(fmtDay(c.verifiedAt.slice(0, 10), "en"))} ${dot(c.seat.en)} Link in bio before it goes.`
    : `Business Class is not reserved for people who don’t look at the price. ${c.city.en}, flat bed, ${fmtEURen(c.price)} round trip${c.was ? ` instead of ${fmtEURen(c.was)}` : ""} — found on ${dot(fmtDate(c.foundAt, "en"))} ${dot(c.seat.en)} The next one reaches you first: link in bio.`;
  return assemble(fr, en, tags(c) + " #reels");
}

// Jeudi « Refusés de la semaine » (marche 3) : la crédibilité en acte — ce qu'on n'a PAS publié, et pourquoi.
function refusesCaption(c) {
  const total = Math.max(c.total || 0, c.items.length);
  const linesFr = c.items.map(r => `✕ ${r.cityFrom.fr} → ${r.cityTo.fr}${r.src ? ` (${r.src})` : ""} : ${r.reason.fr}.`).join("\n");
  const linesEn = c.items.map(r => `✕ ${r.cityFrom.en} → ${r.cityTo.en}${r.src ? ` (${r.src})` : ""}: ${r.reason.en}.`).join("\n");
  const fr = `Cette semaine, ${total} tarifs Business ont été vus, vérifiés à l’écran de paiement… et refusés.

${linesFr}

Un prix annoncé n’est pas un prix payé. Chaque jour, le robot Aeryndo lit les sites de deals et le cache des comparateurs, puis vérifie chaque tarif : prix, compagnie, appareil, siège sur chaque tronçon. Ce qui ne tient pas n’est jamais publié.

Ce que nous publions a passé ce filtre : les deals vérifiés de la semaine sont sur aeryndo.co, lien en bio.`;
  const en = `This week, ${total} Business fares were seen, verified at checkout… and refused.
${linesEn}
An advertised fare is not a paid fare. Every day, the Aeryndo robot reads the deal sites and the fare caches, then verifies each fare: price, airline, aircraft, seat on every leg. Whatever fails is never published. What we publish passed this filter — this week’s verified deals are on aeryndo.co, link in bio.`;
  return assemble(fr, en, "#refusesdelasemaine " + tags(c));
}

function caption(slot, c) {
  if (slot.id === "piege") return piegeCaption(c);
  if (slot.id === "reel") return reelCaption(c);
  if (slot.id === "refuses") return refusesCaption(c);
  return dealCaption(c);
}

module.exports = { caption, dealCaption, piegeCaption, reelCaption, refusesCaption, WHY };
