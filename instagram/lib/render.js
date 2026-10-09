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
function fontFace() {
  const base = path.join(__dirname, "..", "node_modules", "@fontsource");
  const f = p => "file://" + path.join(base, p);
  return `
@font-face{font-family:'Playfair Display';font-weight:500;src:url(${f("playfair-display/files/playfair-display-latin-500-normal.woff2")})}
@font-face{font-family:'Playfair Display';font-weight:400;font-style:italic;src:url(${f("playfair-display/files/playfair-display-latin-400-italic.woff2")})}
@font-face{font-family:'Jost';font-weight:300;src:url(${f("jost/files/jost-latin-300-normal.woff2")})}
@font-face{font-family:'Jost';font-weight:400;src:url(${f("jost/files/jost-latin-400-normal.woff2")})}
@font-face{font-family:'Geist Mono';font-weight:400;src:url(${f("geist-mono/files/geist-mono-latin-400-normal.woff2")})}
@font-face{font-family:'Geist Mono';font-weight:500;src:url(${f("geist-mono/files/geist-mono-latin-500-normal.woff2")})}`;
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
`;
const DIAMOND = `<svg class="d" viewBox="0 0 48 48"><path d="M24 2 L31 18 L46 24 L31 30 L24 46 L17 30 L2 24 L17 18 Z" fill="${CORAL}"/></svg>`;
// échappement HTML + espace insécable fine avant ? ! : ; (typographie française : pas de « ? » orphelin en fin de ligne)
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
  const seatTitle = L === "fr" ? (c.seat.fr.startsWith("Lit entièrement") ? "Un vrai lit, <em>du décollage à l’arrivée.</em>" : "Le siège, <em>tronçon par tronçon.</em>") : (c.seat.en.startsWith("Fully flat") ? "A real bed, <em>from take-off to landing.</em>" : "The seat, <em>leg by leg.</em>");
  const s2 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "La cabine" : "The cabin"}</div><div class="title">${seatTitle}</div>
    <div class="body">${esc(c.seat[L])}<br><br>${L === "fr" ? "C’est ce que nous vérifions avant de publier : l’appareil et la compagnie sur chaque tronçon. Un fauteuil inclinable n’est pas un lit, et nous le disons." : "That is what we check before publishing: the aircraft and airline on every leg. A recliner is not a bed, and we say so."}</div></div>`, null, "2 / 3");
  const proof = c.live
    ? (L === "fr" ? `Prix total par adulte, taxes comprises, vérifié sur Google Flights le ${fmtDay(c.verifiedAt.slice(0, 10), "fr")}${c.was ? " — " + c.discount + " % sous le tarif habituel de la route" : ""}.` : `Total price per adult, taxes included, verified on Google Flights on ${fmtDay(c.verifiedAt.slice(0, 10), "en")}${c.was ? " — " + c.discount + "% below the route’s usual fare" : ""}.`)
    : (L === "fr" ? `Prix total par adulte, taxes comprises, vu à l’écran de paiement le ${fmtDate(c.foundAt, "fr")} — ${c.discount} % sous le tarif habituel de la route. Ce tarif a disparu depuis.` : `Total price per adult, taxes included, seen on the payment screen on ${fmtDate(c.foundAt, "en")} — ${c.discount}% below the route’s usual fare. That fare is gone now.`);
  const s3 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "La preuve" : "The proof"}</div>
    <div class="title">${fmtEUR(c.price)} ${L === "fr" ? "vus à l’écran" : "seen on the"} <em>${L === "fr" ? "de paiement." : "payment screen."}</em></div><div class="body">${esc(proof)}</div></div>
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
  const s3 = frame("p", `<div class="block" style="top:300px"><div class="kicker">${L === "fr" ? "La règle" : "The rule"}</div><div class="title">${esc(c.lesson[L].split(". ")[0])}.</div><div class="body">${esc(c.lesson[L].split(". ").slice(1).join(". "))}</div></div>
    <div class="cta"><div class="k">${L === "fr" ? "Deals Business vérifiés" : "Verified Business deals"}</div><div class="t">${L === "fr" ? "Chaque deal publié sur aeryndo.co est vérifié en direct : prix, compagnie, appareil, siège. Lien en bio." : "Every deal on aeryndo.co is verified live: price, airline, aircraft, seat. Link in bio."}</div></div>`, null, "3 / 3");
  return [s1, s2, s3];
}

// ---------- story 1080×1920 (écran 1 recadré + mention) ----------
function storyPage(c, lang, slotId) {
  const L = lang;
  const head = slotId === "story-piege" ? `<div class="kicker">${L === "fr" ? "Le piège de la semaine" : "This week’s trap"}</div><div class="city" style="font-size:80px">${esc(c.title ? c.title[L] : "")}</div><div class="hook" style="margin-top:36px">${esc(c.hook ? c.hook[L] : "")}</div><div class="price"><span class="amt">${esc(c.price)}</span></div>`
    : `<div class="kicker">${esc(c.kicker ? c.kicker[L] : "")}</div><div class="city">${esc(c.city ? c.city[L] : "")}</div><div class="route">${c.from} → ${c.to}</div><div class="price"><span class="amt">${fmtEUR(c.price)}</span>${c.was ? `<span class="was">${fmtEUR(c.was)}</span>` : ""}</div><div class="det">${esc(c.seat ? c.seat[L] : "")}</div>`;
  return frame("s", `<div class="block" style="top:560px">${head}</div><div class="cta" style="bottom:260px"><div class="k">${L === "fr" ? "Nouveau post" : "New post"}</div><div class="t">${L === "fr" ? "Tout le détail sur le fil · lien en bio" : "Full details on the feed · link in bio"}</div></div>`, c.photo, "");
}

// ---------- reel 1080×1920 : animation 14 s (photo en mouvement lent, prix révélé, CTA) ----------
function reelPage(c, lang) {
  const L = lang;
  const extra = `
@keyframes kb{from{transform:scale(1.12) translate(0,0)}to{transform:scale(1.0) translate(0,-20px)}}
@keyframes up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
.photo{animation:kb 14s linear forwards}
.a1{animation:up .9s ease-out .6s both}.a2{animation:up .9s ease-out 2.2s both}.a3{animation:up .9s ease-out 4.6s both}.a4{animation:up .9s ease-out 7.2s both}.a5{animation:up .9s ease-out 9.8s both}
body.hold .photo,body.hold .a1,body.hold .a2,body.hold .a3,body.hold .a4,body.hold .a5{animation-play-state:paused}
body.hold .a1,body.hold .a2,body.hold .a3,body.hold .a4,body.hold .a5{opacity:0}`;
  const inner = `<div class="block" style="top:520px">
    <div class="kicker a1">${esc(c.kicker[L])}</div><div class="city a2" style="font-size:96px">${esc(c.city[L])}</div><div class="route a2">${c.from} → ${c.to}</div>
    <div class="price a3"><span class="amt" style="font-size:150px">${fmtEUR(c.price)}</span>${c.was ? `<span class="was">${fmtEUR(c.was)}</span>` : ""}</div>
    <div class="det a4"><div>${esc(c.carrier)}${c.aircraft ? " · " + esc(c.aircraft) : ""} · ${esc(c.stops[L])}</div><div>${esc(c.seat[L])}</div></div></div>
    <div class="cta a5" style="bottom:240px"><div class="k">${c.live ? (L === "fr" ? "Avant qu’il ne parte" : "Before it goes") : (L === "fr" ? "Le prochain, avant tout le monde" : "The next one, before everyone else")}</div><div class="t">${L === "fr" ? "Deals Business vérifiés · lien en bio" : "Verified Business deals · link in bio"}</div></div>`;
  return shell(frame("s", inner, c.photo, ""), 1920, extra);
}

async function browser() { const { chromium } = require("playwright"); return chromium.launch(); }

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
      await p.screenshot({ path: file, type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: w, height: h } });
      files.push(file);
    }
  } finally { await b.close(); }
  return files;
}

async function renderReel(html, outDir, name) {
  const b = await browser(); const vdir = path.join(outDir, "video-tmp"); fs.mkdirSync(vdir, { recursive: true });
  let webm, skip = 0.6;
  try {
    const t0 = Date.now();
    const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, recordVideo: { dir: vdir, size: { width: 1080, height: 1920 } } });
    const p = await ctx.newPage();
    // la page est chargée sans animation (classe .hold), puis on la lance une fois la photo prête
    await p.setContent(html.replace("<body>", "<body class=\"hold\">"), { waitUntil: "load" }); await settle(p);
    await p.evaluate(() => document.body.classList.remove("hold"));
    skip = (Date.now() - t0) / 1000;
    await p.waitForTimeout(14500);
    webm = await p.video().path(); await ctx.close();
  } finally { await b.close(); }
  const mp4 = path.join(outDir, name + ".mp4");
  // MP4 H.264 + piste audio silencieuse AAC (exigée par Instagram), 30 i/s, 14 s
  execFileSync("ffmpeg", ["-y", "-i", webm, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-ss", skip.toFixed(2), "-t", "14", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", mp4], { stdio: "ignore" });
  fs.rmSync(vdir, { recursive: true, force: true });
  return mp4;
}

async function render(slot, c, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  if (slot.kind === "carousel") {
    const slides = slot.id === "piege" ? piegeSlides(c, "fr") : dealSlides(c, "fr");
    const en = slot.id === "piege" ? piegeSlides(c, "en") : dealSlides(c, "en");
    const files = await renderImages(slides, outDir, "slide", 1080, 1350);
    await renderImages(en, outDir, "slide-en", 1080, 1350);
    return { images: files };
  }
  if (slot.kind === "story") {
    const files = await renderImages([storyPage(c, "fr", slot.id)], outDir, "story", 1080, 1920);
    return { images: files };
  }
  if (slot.kind === "reel") {
    const video = await renderReel(reelPage(c, "fr"), outDir, "reel");
    const cover = await renderImages([frame("s", `<div class="block" style="top:520px"><div class="kicker">${esc(c.kicker.fr)}</div><div class="city" style="font-size:96px">${esc(c.city.fr)}</div><div class="price"><span class="amt" style="font-size:150px">${fmtEUR(c.price)}</span></div></div>`, c.photo, "")], outDir, "cover", 1080, 1920);
    return { video, cover: cover[0] };
  }
  throw new Error("créneau inconnu " + slot.kind);
}

module.exports = { render, dealSlides, piegeSlides, storyPage, reelPage, shell };
