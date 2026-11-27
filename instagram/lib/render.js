// Rendu des visuels dans l'identité Aeryndo (encre #0E0E0F, ivoire, corail ; Playfair / Jost / Geist Mono)
// avec Playwright (Chromium). Même composition que le Studio visuel : losange + AERYNDO, kicker corail,
// ville en Playfair, prix dominant, prix barré, détails, aeryndo.co en pied.
//   carousel : 3 images 1080×1350 (JPEG)   story : 1 image 1080×1920   reel : vidéo 1080×1920 MP4 (14 s)
// Les polices viennent des paquets @fontsource installés par le workflow (pas d'appel réseau au rendu).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { fmtEUR, fmtDay, fmtDate } = require("./content.js");

const INK = "#0E0E0F", IVORY = "#F3F0E9", STONE = "#b8b3aa", CORAL = "#FF6B57";
// Les polices sont lues dans node_modules/@fontsource et intégrées en base64 : la page est rendue via
// setContent (origine about:blank), qui refuse de charger des fichiers locaux par URL file://.
const FONT_FILES = [
  ["Playfair Display", 500, "normal", "playfair-display/files/playfair-display-latin-500-normal.woff2"],
  ["Playfair Display", 400, "italic", "playfair-display/files/playfair-display-latin-400-italic.woff2"],
  ["Jost", 300, "normal", "jost/files/jost-latin-300-normal.woff2"],
  ["Jost", 400, "normal", "jost/files/jost-latin-400-normal.woff2"],
  ["Geist Mono", 400, "normal", "geist-mono/files/geist-mono-latin-400-normal.woff2"],
  ["Geist Mono", 500, "normal", "geist-mono/files/geist-mono-latin-500-normal.woff2"]
];
let FONT_CSS = null;
function fontFace() {
  if (FONT_CSS != null) return FONT_CSS;
  const base = path.join(__dirname, "..", "node_modules", "@fontsource");
  const out = [];
  for (const [family, weight, style, file] of FONT_FILES) {
    const f = path.join(base, file);
    if (!fs.existsSync(f)) { if (process.env.ALLOW_MISSING_FONTS === "1") { console.warn("police absente :", file); continue; } throw new Error("police absente : " + file + " (npm install incomplet)"); }
    const b64 = fs.readFileSync(f).toString("base64");
    out.push(`@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${b64}) format('woff2')}`);
  }
  return (FONT_CSS = out.join("\n"));
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${INK};color:${IVORY};font-family:'Jost',system-ui,sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}
.page{position:relative;width:1080px;overflow:hidden;background:${INK}}
.page.p{height:1350px}.page.s{height:1920px}
.photo{position:absolute;inset:0;background-size:cover;background-position:center}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,14,15,.70),rgba(14,14,15,.28) 30%,rgba(14,14,15,.76) 56%,rgba(14,14,15,.97))}
.halo{position:absolute;inset:0;background:radial-gradient(620px 620px at 960px 80px,rgba(255,107,87,.16),rgba(255,107,87,0))}
.brand{position:absolute;left:92px;top:88px;display:flex;align-items:center;gap:22px}
.brand .d{width:48px;height:48px}
.brand .n{font-family:'Playfair Display';font-weight:500;font-size:28px;letter-spacing:6px}
.foot{position:absolute;left:92px;bottom:60px;font-family:'Geist Mono';font-weight:500;font-size:30px;letter-spacing:3px;color:${CORAL}}
.pg{position:absolute;right:92px;bottom:60px;font-family:'Geist Mono';font-size:22px;color:${STONE}}
.block{position:absolute;left:92px;right:92px}
.kicker{font-size:25px;letter-spacing:7.5px;text-transform:uppercase;color:${CORAL};padding-bottom:22px;border-bottom:1px solid rgba(243,240,233,.16);margin-bottom:34px}
.city{font-family:'Playfair Display';font-weight:500;font-size:84px;line-height:1.05}
.route{font-family:'Geist Mono';font-size:27px;letter-spacing:2.5px;color:${STONE};margin-top:14px}
.price{display:flex;align-items:baseline;gap:34px;margin-top:40px}
.price .amt{font-family:'Playfair Display';font-weight:500;font-size:120px;line-height:1}
.price .was{font-family:'Geist Mono';font-size:40px;color:${STONE};text-decoration:line-through}
.det{font-size:34px;line-height:1.35;color:${STONE};margin-top:26px}
.det div{margin-top:10px}
.title{font-family:'Playfair Display';font-weight:500;font-size:78px;line-height:1.12}
.title em{font-style:italic;font-weight:400;color:${CORAL}}
.body{font-size:36px;line-height:1.45;color:${STONE};margin-top:40px}
.cta{position:absolute;left:92px;right:92px;bottom:200px;padding-top:40px;border-top:1px solid rgba(243,240,233,.16)}
.cta .k{font-size:25px;letter-spacing:7.5px;text-transform:uppercase;color:${CORAL}}
.cta .t{font-size:34px;line-height:1.35;margin-top:18px}
.hook{font-family:'Playfair Display';font-style:italic;font-size:46px;color:${STONE};line-height:1.3}
.rf{padding:26px 0;border-bottom:1px solid rgba(243,240,233,.12)}.rf:last-child{border-bottom:0}
.rt{font-family:'Playfair Display';font-weight:500;font-size:44px;line-height:1.15}.rs{font-family:'Geist Mono';font-size:22px;letter-spacing:2px;color:${STONE};font-weight:400}
.rr{font-size:30px;line-height:1.35;color:${STONE};margin-top:10px}.rr::before{content:"✕  ";color:${CORAL}}
`;
const DIAMOND = `<svg class="d" viewBox="0 0 48 48"><path d="M24 2 L31 18 L46 24 L31 30 L24 46 L17 30 L2 24 L17 18 Z" fill="${CORAL}"/></svg>`;
// échappement HTML + espace insécable fine avant ? ! : ; (typographie française : pas de « ? » orphelin en fin de ligne)
const dot = s => String(s == null ? "" : s).replace(/\.$/, "") + ".";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/ ([?!:;»])/g, "\u202f$1").replace(/« /g, "«\u202f");

function shell(body, h, extra) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFace()}${CSS}${extra || ""}</style></head><body>${body}</body></html>`;
}
function frame(cls, inner, photo, pageNo) {
  return `<div class="page ${cls}">${photo ? `<div class="photo" style="background-image:url('${esc(photo)}')"></div><div class="veil"></div>` : `<div class="halo"></div>`}
  <div class="brand">${DIAMOND}<span class="n">AERYNDO</span></div>${inner}
  <div class="foot">aeryndo.co</div>${pageNo ? `<div class="pg">${pageNo}</div>` : ""}</div>`;
}

// ---------- carrousel « deal » / palmarès : 3 écrans ----------
function dealSlides(c, lang) {
  const L = lang;
  const det = [`${c.carrier}${c.aircraft ? " · " + c.aircraft : ""} · ${c.stops[L]}`, c.seat[L].replace(/\.$/, ""), (L === "fr" ? "Aller-retour · " : "Round trip · ") + fmtDay(c.dep, L) + " → " + fmtDay(c.ret, L) + (L === "fr" ? " · par adulte" : " · per adult")];
  const s1 = frame("p", `<div class="block" style="bottom:150px">
    <div class="kicker">${esc(c.kicker[L])}</div><div class="city">${esc(c.city[L])}</div><div class="route">${c.from} → ${c.to}</div>
    <div class="price"><span class="amt">${fmtEUR(c.price)}</span>${c.was ? `<span class="was">${fmtEUR(c.was)}</span>` : ""}</div>
    <div class="det">${det.map(d => `<div>${esc(d)}</div>`).join("")}</div></div>`, c.photo, "1 / 3");
  const flat = c.seatKind ? c.seatKind === "flat" : /^(Lit entièrement|Fully flat)/.test(c.seat[L]);
  const seatTitle = L === "fr" ? (flat ? "Un vrai lit, <em>du décollage à l’arrivée.</em>" : "Le siège, <em>tronçon par tronçon.</em>") : (flat ? "A real bed, <em>from take-off to landing.</em>" : "The seat, <em>leg by leg.</em>");
  const s2 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "La cabine" : "The cabin"}</div><div class="title">${seatTitle}</div>
    <div class="body">${esc(c.seat[L])}<br><br>${L === "fr" ? "C’est ce que nous vérifions avant de publier : l’appareil et la compagnie sur chaque tronçon. Un fauteuil inclinable n’est pas un lit, et nous le disons." : "That is what we check before publishing: the aircraft and airline on every leg. A recliner is not a bed, and we say so."}</div></div>`, null, "2 / 3");
  const proof = c.live
    ? (L === "fr" ? `Prix total par adulte, taxes comprises, vérifié sur Google Flights le ${fmtDay(c.verifiedAt.slice(0, 10), "fr")}${c.was ? " — " + c.discount + " % sous le tarif habituel de la route" : ""}` : `Total price per adult, taxes included, verified on Google Flights on ${fmtDay(c.verifiedAt.slice(0, 10), "en")}${c.was ? " — " + c.discount + "% below the route’s usual fare" : ""}`)
    : (L === "fr" ? `Prix total par adulte, taxes comprises, vu à l’écran de paiement le ${fmtDate(c.foundAt, "fr")} — ${c.discount} % sous le tarif habituel de la route. Ce tarif a disparu depuis.` : `Total price per adult, taxes included, seen on the payment screen on ${fmtDate(c.foundAt, "en")} — ${c.discount}% below the route’s usual fare. That fare is gone now.`);
  const s3 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "La preuve" : "The proof"}</div>
    <div class="title">${fmtEUR(c.price)} ${L === "fr" ? "vus à l’écran" : "seen on the"} <em>${L === "fr" ? "de paiement." : "payment screen."}</em></div><div class="body">${esc(dot(proof))}</div></div>
    <div class="cta"><div class="k">${c.live ? (L === "fr" ? "Avant qu’il ne parte" : "Before it goes") : (L === "fr" ? "Le prochain, avant tout le monde" : "The next one, before everyone else")}</div>
    <div class="t">${L === "fr" ? `Suivez ${esc(c.city.fr)} sur aeryndo.co : les tarifs du moment par email, puis l’alerte à chaque baisse. Lien en bio.` : `Track ${esc(c.city.en)} on aeryndo.co: today’s fares by email, then an alert at every drop. Link in bio.`}</div></div>`, null, "3 / 3");
  return [s1, s2, s3];
}

// ---------- carrousel « piège de la semaine » : 3 écrans ----------
function piegeSlides(c, lang) {
  const L = lang;
  const s1 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "Le piège de la semaine" : "This week’s trap"}</div>
    <div class="city" style="font-size:72px">${esc(c.title[L])}</div><div class="hook" style="margin-top:40px">${esc(c.hook[L])}</div>
    <div class="price"><span class="amt">${esc(c.price)}</span></div><div class="route">${esc(c.route)}</div></div>`, c.photo, "1 / 3");
  const s2 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "Le piège" : "The trap"}</div><div class="title">${esc(c.detail[L])}</div><div class="body">${esc(c.body[L])}</div></div>`, null, "2 / 3");
  const s3 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "La règle" : "The rule"}</div><div class="title">${esc(dot(c.lesson[L].split(". ")[0]))}</div><div class="body">${esc(c.lesson[L].split(". ").slice(1).join(". "))}</div></div>
    <div class="cta"><div class="k">${L === "fr" ? "Deals Business vérifiés" : "Verified Business deals"}</div><div class="t">${L === "fr" ? "Chaque deal publié sur aeryndo.co est vérifié en direct : prix, compagnie, appareil, siège. Lien en bio." : "Every deal on aeryndo.co is verified live: price, airline, aircraft, seat. Link in bio."}</div></div>`, null, "3 / 3");
  return [s1, s2, s3];
}

// ---------- carrousel « refusés de la semaine » (v10-com, jeudi, marche 3) : 3 écrans ----------
// La preuve la plus honnête qu'on puisse montrer : ce que le robot a lu, vérifié à l'écran de paiement, et refusé.
function refusesSlides(c, lang) {
  const L = lang;
  const n = c.items.length, total = Math.max(c.total || 0, n);
  const s1 = frame("p", `<div class="block" style="bottom:150px"><div class="kicker">${L === "fr" ? "Refusés cette semaine" : "Refused this week"}</div>
    <div class="city" style="font-size:78px">${L === "fr" ? `${total} tarifs Business<br>écartés.` : `${total} Business fares<br>turned down.`}</div>
    <div class="hook" style="margin-top:40px">${L === "fr" ? "Vus sur les sites de deals. Vérifiés à l’écran de paiement. Jamais publiés." : "Seen on deal sites. Verified at checkout. Never published."}</div></div>`, c.photo, "1 / 3");
  const rows = c.items.map(r => `<div class="rf"><div class="rt">${esc(r.cityFrom[L])} → ${esc(r.cityTo[L])}${r.src ? ` <span class="rs">· ${esc(r.src)}</span>` : ""}</div><div class="rr">${esc(r.reason[L])}</div></div>`).join("");
  const s2 = frame("p", `<div class="block" style="top:250px"><div class="kicker">${L === "fr" ? "Pourquoi" : "Why"}</div>${rows}</div>`, null, "2 / 3");
  const s3 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "La règle" : "The rule"}</div>
    <div class="title">${L === "fr" ? "Un prix annoncé n’est pas <em>un prix payé.</em>" : "An advertised fare is not <em>a paid fare.</em>"}</div>
    <div class="body">${L === "fr" ? "Chaque jour, le robot Aeryndo lit les sites de deals et le cache des comparateurs, puis vérifie chaque tarif à l’écran de paiement : prix, compagnie, appareil, siège sur chaque tronçon. Ce qui ne tient pas n’est jamais publié." : "Every day, the Aeryndo robot reads the deal sites and the fare caches, then verifies each fare at checkout: price, airline, aircraft, seat on every leg. Whatever fails is never published."}</div></div>
    <div class="cta"><div class="k">${L === "fr" ? "Ce que nous publions a passé ce filtre" : "What we publish passed this filter"}</div><div class="t">${L === "fr" ? "Les deals Business vérifiés de la semaine sont sur aeryndo.co. Lien en bio." : "This week’s verified Business deals are on aeryndo.co. Link in bio."}</div></div>`, null, "3 / 3");
  return [s1, s2, s3];
}

// ---------- story 1080×1920 (écran 1 recadré + mention) ----------
function storyPage(c, lang, slotId) {
  const L = lang;
  const head = slotId === "story-piege" ? `<div class="kicker">${L === "fr" ? "Le piège de la semaine" : "This week’s trap"}</div><div class="city" style="font-size:80px">${esc(c.title ? c.title[L] : "")}</div><div class="hook" style="margin-top:36px">${esc(c.hook ? c.hook[L] : "")}</div><div class="price"><span class="amt">${esc(c.price)}</span></div>`
    : slotId === "story-refuses" ? `<div class="kicker">${L === "fr" ? "Refusés cette semaine" : "Refused this week"}</div><div class="city" style="font-size:80px">${L === "fr" ? `${Math.max(c.total || 0, (c.items || []).length)} tarifs Business écartés.` : `${Math.max(c.total || 0, (c.items || []).length)} Business fares turned down.`}</div><div class="hook" style="margin-top:36px">${L === "fr" ? "Vérifiés à l’écran de paiement. Jamais publiés." : "Verified at checkout. Never published."}</div>`
    : `<div class="kicker">${esc(c.kicker ? c.kicker[L] : "")}</div><div class="city">${esc(c.city ? c.city[L] : "")}</div><div class="route">${c.from} → ${c.to}</div><div class="price"><span class="amt">${fmtEUR(c.price)}</span>${c.was ? `<span class="was">${fmtEUR(c.was)}</span>` : ""}</div><div class="det">${esc(c.seat ? c.seat[L] : "")}</div>`;
  return frame("s", `<div class="block" style="top:560px">${head}</div><div class="cta" style="bottom:260px"><div class="k">${L === "fr" ? "Nouveau post" : "New post"}</div><div class="t">${L === "fr" ? "Tout le détail sur le fil · lien en bio" : "Full details on the feed · link in bio"}</div></div>`, c.photo, "");
}

// ---------- reel 1080×1920 : animation 14 s (photo en mouvement lent, prix révélé, CTA) ----------
// Reel : format de découverte (vu par des inconnus, souvent sans lire la légende) → texte à l'écran en ANGLAIS,
// doublé d'une ligne française plus petite. La légende reste bilingue (caption.js). Décision du 13 oct. 2026.
// ---------- Reel 1080×1920, 14 s — v11 « cinéma » (27 nov. 2026, référence de Valentyna : film Range Rover Sport) ----------
// Une idée par écran, beaucoup d'air, typographie serif centrée, fondus lents, poussée lente sur l'image, vignette
// sombre. Quatre actes calés sur la musique (la grosse caisse entre sur le prix, 4,6 s) :
//   1. 0,9 s  la ville, un mot ; 2,4 s  « Business · lit à plat »
//   2. 4,6 s  le prix, seul ; 5,4 s  la preuve (aller-retour, vu à l'écran de paiement le …) ; 6,2 s  l'ancien prix barré
//   3. 8,0 s  « Vous ne payez plus le prix affiché. »
//   4. 12,0 s diamant · aeryndo.co · lien en bio
function reelPage(c) {
  const L = "fr";
  const extra = `
@keyframes push{from{transform:scale(1.0)}to{transform:scale(1.09)}}
@keyframes in{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes out{from{opacity:1}to{opacity:0}}
.photo{animation:push 14s cubic-bezier(.3,0,.7,1) forwards;filter:brightness(.62) saturate(.8) contrast(1.05)}
.page.s .veil{background:linear-gradient(180deg,rgba(14,14,15,.82) 0%,rgba(14,14,15,.38) 28%,rgba(14,14,15,.5) 50%,rgba(14,14,15,.38) 70%,rgba(14,14,15,.94) 100%)}
.act{text-shadow:0 2px 28px rgba(0,0,0,.65),0 0 2px rgba(0,0,0,.4)}
.act::before{content:"";position:absolute;left:-200px;right:-200px;top:-160px;bottom:-160px;background:radial-gradient(ellipse at center,rgba(14,14,15,.55) 0%,rgba(14,14,15,0) 70%);z-index:-1}
.page.s>.brand,.page.s>.foot{display:none}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(14,14,15,0) 45%,rgba(14,14,15,.55) 100%)}
.act{position:absolute;left:80px;right:80px;text-align:center;opacity:0}
.mark{top:120px;font-family:'Playfair Display';font-weight:500;font-size:22px;letter-spacing:12px;color:${IVORY};animation:in 1.2s ease-out .6s both}
.a1{top:760px;animation:in .9s ease-out .9s both,out .5s ease-in 4.1s forwards}
.a1 .w{font-family:'Playfair Display';font-weight:500;font-size:132px;line-height:1.02;color:${IVORY}}
.a1 .s{margin-top:34px;font-size:24px;letter-spacing:8px;text-transform:uppercase;color:rgba(243,240,233,.85);opacity:0;animation:in .8s ease-out 2.4s both}
.a2{top:700px;animation:in .9s ease-out 4.6s both,out .5s ease-in 7.6s forwards}
.a2 .line{width:120px;height:1px;background:${CORAL};margin:0 auto 34px}
.a2 .amt{font-family:'Playfair Display';font-weight:500;font-size:190px;line-height:1;color:${IVORY};letter-spacing:-2px}
.a2 .was{font-family:'Playfair Display';font-style:italic;font-size:44px;color:${STONE};text-decoration:line-through;text-decoration-color:${CORAL};margin-top:26px;opacity:0;animation:in .8s ease-out 6.2s both}
.a2 .p{margin-top:30px;font-size:23px;letter-spacing:5px;text-transform:uppercase;color:rgba(243,240,233,.88);line-height:1.7;opacity:0;animation:in .8s ease-out 5.4s both}
.a3{top:780px;animation:in 1s ease-out 8s both,out .5s ease-in 11.6s forwards}
.a3 .t{font-family:'Playfair Display';font-weight:400;font-size:78px;line-height:1.18;color:${IVORY}}
.a3 .t em{font-style:italic;color:${CORAL}}
.a3 .en{margin-top:30px;font-size:24px;letter-spacing:5px;text-transform:uppercase;color:${STONE}}
.a4{top:800px;animation:in 1s ease-out 12s both}
.a4 .d{margin:0 auto 30px}
.a4 .u{font-family:'Geist Mono';font-weight:500;font-size:34px;letter-spacing:8px;color:${IVORY}}
.a4 .k{margin-top:22px;font-size:22px;letter-spacing:5px;text-transform:uppercase;color:${STONE}}
body.hold .photo,body.hold .act,body.hold .a1 .s,body.hold .a2 .was,body.hold .a2 .p{animation-play-state:paused}
body.hold .act{opacity:0}`;
  const city = esc(c.city[L]);
  const seatShort = c.seatKind === "flat" ? { fr: "Business · lit à plat", en: "Business · flat bed" } : c.seatKind === "partial" ? { fr: "Business · lit à plat sur le long-courrier", en: "Business · flat bed on the long haul" } : { fr: "Business", en: "Business" };
  const when = c.verifiedAt ? fmtDay(c.verifiedAt.slice(0, 10), "fr") : (c.foundAt ? fmtDate(c.foundAt, "fr") : "");
  const proof = c.live ? `Aller-retour · vu à l’écran de paiement le ${esc(when)}` : `Aller-retour · déniché le ${esc(when)}`;
  const inner = `<div class="vig"></div>
    <div class="act mark">AERYNDO</div>
    <div class="act a1"><div class="w">${city}.</div><div class="s">${esc(seatShort.fr)}</div></div>
    <div class="act a2"><div class="line"></div><div class="amt">${fmtEUR(c.price).replace(/[\u202f\u00a0 ]/g, "<span style=\"display:inline-block;width:.22em\"></span>")}</div>${c.was ? `<div class="was">${fmtEUR(c.was)}</div>` : ""}<div class="p">${proof}<br>${esc(c.from)} → ${esc(c.to)} · ${esc(c.carrier)}</div></div>
    <div class="act a3"><div class="t">Vous ne payez plus<br><em>le prix affiché.</em></div><div class="en">You no longer pay the advertised fare</div></div>
    <div class="act a4"><div class="d"><svg width="54" height="54" viewBox="0 0 48 48"><path d="M24 2 L31 18 L46 24 L31 30 L24 46 L17 30 L2 24 L17 18 Z" fill="${CORAL}"/></svg></div><div class="u">aeryndo.co</div><div class="k">${c.live ? "Avant qu’il ne parte · lien en bio" : "Le prochain, avant tout le monde · lien en bio"}</div></div>`;
  return shell(frame("s", inner, c.photo, ""), 1920, extra);
}

async function browser() { const { chromium } = require("playwright"); return chromium.launch(); }

// La photo de fond est chargée ici, en Node, et embarquée en data-URI : si elle manque, on échoue au lieu de
// publier un visuel noir. (Le site la sert via /api/photo, cache 30 j.)
async function inlinePhoto(url) {
  if (!url || url.startsWith("data:")) return url;
  if (/\/api\/photo\?/.test(url) && !/fresh=1/.test(url)) url += "&fresh=1"; // adresse Pixabay redemandée à l'instant (elles expirent)
  let last = null;
  for (let i = 0; i < 3; i++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (!ct.startsWith("image/")) throw new Error("type " + ct);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 10000) throw new Error("image trop petite (" + buf.length + " o)");
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch (e) { last = e; await new Promise(ok => setTimeout(ok, 4000)); }
  }
  throw new Error("photo de destination indisponible : " + url + " — " + (last && last.message));
}

// Attend les polices ET la photo de fond (background-image n'est pas couverte par l'événement load)
async function settle(p) {
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.querySelectorAll(".photo")].map(el => new Promise(ok => {
    const m = /url\(['"]?([^'")]+)/.exec(el.style.backgroundImage || ""); if (!m) return ok();
    const img = new Image(); img.onload = img.onerror = () => ok(); img.src = m[1]; setTimeout(ok, 15000);
  }))));
  await p.waitForTimeout(300);
}

async function renderImages(pages, outDir, prefix, w, h) {
  const b = await browser(); const files = [];
  try {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    for (let i = 0; i < pages.length; i++) {
      await p.setContent(shell(pages[i]), { waitUntil: "load" });
      await settle(p);
      const file = path.join(outDir, `${prefix}-${i + 1}.jpg`);
      await p.screenshot({ path: file, type: "jpeg", quality: 93, clip: { x: 0, y: 0, width: w, height: h } });
      files.push(file);
    }
  } finally { await b.close(); }
  return files;
}

async function renderReel(html, outDir, name) {
  const b = await browser(); const vdir = path.join(outDir, "video-tmp"); fs.mkdirSync(vdir, { recursive: true });
  let webm, skip = 0.6;
  try {
    const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, recordVideo: { dir: vdir, size: { width: 1080, height: 1920 } } });
    const p = await ctx.newPage();
    const t0 = Date.now();
    // la page est chargée sans animation (classe .hold), puis on la lance une fois la photo prête
    await p.setContent(html.replace("<body>", "<body class=\"hold\">"), { waitUntil: "load" }); await settle(p);
    await p.evaluate(() => document.body.classList.remove("hold"));
    skip = (Date.now() - t0) / 1000;
    await p.waitForTimeout(14500);
    webm = await p.video().path(); await ctx.close();
  } finally { await b.close(); }
  const mp4 = path.join(outDir, name + ".mp4");
  // v9.2 : MP4 H.264 + la musique originale Aeryndo (lib/music.js, composée à chaque rendu) en AAC 128 k, 30 i/s, 14 s.
  // La vidéo est coupée de `skip` (temps de chargement avant le départ des animations) ; la musique démarre avec elles.
  const wav = path.join(vdir, "music.wav");
  require("./music.js").write(wav);
  execFileSync("ffmpeg", ["-y", "-ss", skip.toFixed(2), "-i", webm, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-t", "14", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-shortest", "-use_editlist", "0", "-movflags", "+faststart", mp4], { stdio: ["ignore", "ignore", "pipe"] });
  fs.rmSync(vdir, { recursive: true, force: true });
  return mp4;
}

async function render(slot, c, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  c = Object.assign({}, c, { photo: await inlinePhoto(c.photo) });
  if (slot.kind === "carousel") {
    const build = slot.id === "piege" ? piegeSlides : slot.id === "refuses" ? refusesSlides : dealSlides;
    const slides = build(c, "fr"), en = build(c, "en");
    const files = await renderImages(slides, outDir, "slide", 1080, 1350);
    await renderImages(en, outDir, "slide-en", 1080, 1350);
    return { images: files };
  }
  if (slot.kind === "story") {
    const files = await renderImages([storyPage(c, "fr", slot.id)], outDir, "story", 1080, 1920);
    return { images: files };
  }
  if (slot.kind === "reel") {
    const video = await renderReel(reelPage(c), outDir, "reel");
    const cover = await renderImages([frame("s", `<div class="block" style="top:520px"><div class="kicker">${esc(c.kicker.en)}</div><div class="city" style="font-size:96px">${esc(c.city.en)}</div><div class="price"><span class="amt" style="font-size:150px">${fmtEUR(c.price)}</span></div></div>`, c.photo, "")], outDir, "cover", 1080, 1920);
    return { video, cover: cover[0] };
  }
  throw new Error("créneau inconnu " + slot.kind);
}

module.exports = { render, dealSlides, piegeSlides, refusesSlides, storyPage, reelPage, shell };
