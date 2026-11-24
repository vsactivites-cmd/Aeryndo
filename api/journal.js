// ============================================================
// /journal/<id> et /<lang>/journal/<id> — les articles du journal en vraies pages (v10-seo, 24 nov. 2026)
//
// Pourquoi : les 12 articles (6 guides + 6 pièges, 12 langues) vivent dans index.html et s'ouvrent dans une
// fenêtre via #journal/<id>. Google n'indexe pas un « # » : aucune de ces pages n'existait pour lui, donc zéro
// visite de recherche sur « classe affaires pas chère », « lit à plat », « tarif erreur business »… Ici chaque
// article devient une page HTML complète (titre, description, canonical, hreflang des 12 langues, Article en
// JSON-LD, fil d'Ariane, liens vers les autres articles et vers l'accueil), rendue côté serveur à partir du
// MÊME contenu qu'index.html (lu et extrait à l'exécution : une seule source de vérité, rien à dupliquer).
//
// Routes (vercel.json → rewrites) :
//   /journal                → sommaire FR          /journal/<id>        → article FR
//   /<lang>/journal         → sommaire <lang>      /<lang>/journal/<id> → article <lang>  (en es de it pt ru zh ar ja ko hi)
// Cache CDN 1 jour (stale-while-revalidate 7 jours) : le contenu ne change qu'à un déploiement.
// ============================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = "https://aeryndo.co";
const LANGS = ["fr", "en", "es", "de", "it", "pt", "ru", "zh", "ar", "ja", "ko", "hi"];
const RTL = new Set(["ar"]);
const LOCALE = { fr: "fr_FR", en: "en_GB", es: "es_ES", de: "de_DE", it: "it_IT", pt: "pt_PT", ru: "ru_RU", zh: "zh_CN", ar: "ar_AR", ja: "ja_JP", ko: "ko_KR", hi: "hi_IN" };
// Les trois libellés qui n'existent pas dans I18N (index.html) : fil d'Ariane, « lire aussi », date de mise à jour.
const UI = {
  fr: { home: "Accueil", also: "À lire aussi", by: "Par Aeryndo", deals: "Voir les deals vérifiés", legal: "Les liens de réservation d’aeryndo.co sont des liens partenaires : si vous réservez, nous pouvons percevoir une commission, au même prix pour vous." },
  en: { home: "Home", also: "Read next", by: "By Aeryndo", deals: "See the verified deals", legal: "Booking links on aeryndo.co are partner links: if you book, we may earn a commission, at the same price for you." },
  es: { home: "Inicio", also: "Leer también", by: "Por Aeryndo", deals: "Ver las ofertas verificadas", legal: "Los enlaces de reserva de aeryndo.co son enlaces de afiliación: si reservas, podemos recibir una comisión, al mismo precio para ti." },
  de: { home: "Start", also: "Auch lesen", by: "Von Aeryndo", deals: "Geprüfte Deals ansehen", legal: "Buchungslinks auf aeryndo.co sind Partnerlinks: Wenn Sie buchen, erhalten wir ggf. eine Provision — zum gleichen Preis für Sie." },
  it: { home: "Home", also: "Da leggere", by: "Di Aeryndo", deals: "Vedi le offerte verificate", legal: "I link di prenotazione di aeryndo.co sono link partner: se prenoti, possiamo ricevere una commissione, allo stesso prezzo per te." },
  pt: { home: "Início", also: "Ler também", by: "Por Aeryndo", deals: "Ver as ofertas verificadas", legal: "Os links de reserva de aeryndo.co são links de parceiros: se reservar, podemos receber uma comissão, ao mesmo preço para si." },
  ru: { home: "Главная", also: "Читайте также", by: "Aeryndo", deals: "Проверенные предложения", legal: "Ссылки на бронирование на aeryndo.co — партнёрские: при бронировании мы можем получить комиссию, цена для вас не меняется." },
  zh: { home: "首页", also: "延伸阅读", by: "Aeryndo", deals: "查看已核实的优惠", legal: "aeryndo.co 的预订链接为合作伙伴链接：如您预订，我们可能获得佣金，您的价格不变。" },
  ar: { home: "الرئيسية", also: "اقرأ أيضًا", by: "Aeryndo", deals: "العروض المُتحقق منها", legal: "روابط الحجز على aeryndo.co روابط شراكة: عند الحجز قد نحصل على عمولة، بالسعر نفسه لك." },
  ja: { home: "ホーム", also: "あわせて読む", by: "Aeryndo", deals: "検証済みのディールを見る", legal: "aeryndo.co の予約リンクはパートナーリンクです。ご予約時に手数料を受け取る場合がありますが、価格は変わりません。" },
  ko: { home: "홈", also: "함께 읽기", by: "Aeryndo", deals: "검증된 특가 보기", legal: "aeryndo.co의 예약 링크는 파트너 링크입니다. 예약 시 수수료를 받을 수 있으며 가격은 동일합니다." },
  hi: { home: "होम", also: "यह भी पढ़ें", by: "Aeryndo", deals: "सत्यापित सौदे देखें", legal: "aeryndo.co के बुकिंग लिंक पार्टनर लिंक हैं: बुकिंग पर हमें कमीशन मिल सकता है, आपके लिए कीमत वही रहती है।" }
};

// ---------- le contenu, extrait d'index.html (une seule source de vérité) ----------
let CACHE = null;
function load() {
  if (CACHE) return CACHE;
  const candidates = [path.join(process.cwd(), "index.html"), path.join(__dirname, "..", "index.html")];
  const file = candidates.find(f => fs.existsSync(f));
  if (!file) throw new Error("index.html introuvable");
  const html = fs.readFileSync(file, "utf8");
  const j = /\nconst JOURNAL=(\[[\s\S]*?\n\]);\n/.exec(html);
  const i = /\nconst I18N=(\{[\s\S]*?\n\});\nlet LANG/.exec(html);
  if (!j || !i) throw new Error("JOURNAL ou I18N introuvable dans index.html");
  const ctx = vm.createContext({});
  CACHE = { journal: vm.runInContext("(" + j[1] + ")", ctx, { timeout: 2000 }), i18n: vm.runInContext("(" + i[1] + ")", ctx, { timeout: 2000 }) };
  return CACHE;
}

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const urlOf = (lang, id) => SITE + (lang === "fr" ? "" : "/" + lang) + "/journal" + (id ? "/" + id : "");
const text = (a, lang) => a[lang] || a.en || a.fr;
const tr = (i18n, lang, k) => (i18n[lang] && i18n[lang][k]) || i18n.en[k] || i18n.fr[k] || k;

const CSS = `
:root{--ink:#0E0E0F;--ivory:#F3F0E9;--coral:#FF6B57;--stone:#B8B3AA;--line:rgba(243,240,233,.14)}
*{box-sizing:border-box;margin:0;padding:0}
html{color-scheme:dark}
body{background:var(--ink);color:var(--ivory);font-family:'Jost',system-ui,sans-serif;font-weight:300;font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}
body.ar{font-family:'Noto Sans Arabic','Jost',sans-serif}body.zh{font-family:'Noto Sans SC','Jost',sans-serif}body.ja{font-family:'Noto Sans JP','Jost',sans-serif}body.ko{font-family:'Noto Sans KR','Jost',sans-serif}body.hi{font-family:'Noto Sans Devanagari','Jost',sans-serif}
a{color:inherit}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;padding:22px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:'Playfair Display',serif;font-weight:500;letter-spacing:5px;font-size:15px}
.brand svg{width:22px;height:22px}
nav a{text-decoration:none;color:var(--stone);font-size:14px;letter-spacing:1px;margin-left:18px}
nav a:hover{color:var(--ivory)}
.crumb{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:1.5px;color:var(--stone);margin:34px 0 18px}
.crumb a{text-decoration:none}
.kicker{font-size:12px;letter-spacing:4px;text-transform:uppercase;color:var(--coral);margin-bottom:16px}
h1{font-family:'Playfair Display',serif;font-weight:500;font-size:clamp(30px,5vw,44px);line-height:1.12;margin-bottom:20px}
.lede{font-size:20px;line-height:1.5;color:var(--stone);margin-bottom:26px}
.meta{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:1.5px;color:var(--stone);padding:14px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:30px;display:flex;gap:18px;flex-wrap:wrap}
figure{margin:0 0 30px;border-radius:14px;overflow:hidden;aspect-ratio:16/9;background:#161618}
figure img{width:100%;height:100%;object-fit:cover;display:block}
blockquote{font-family:'Playfair Display',serif;font-style:italic;font-size:24px;line-height:1.35;color:var(--ivory);border-left:3px solid var(--coral);padding:6px 0 6px 22px;margin:30px 0}
body.ar blockquote{border-left:0;border-right:3px solid var(--coral);padding:6px 22px 6px 0}
article p{margin:0 0 18px}
.detail{font-size:20px;font-weight:400}
.lesson{margin:34px 0;padding:22px 24px;border:1px solid var(--line);border-radius:14px;background:rgba(243,240,233,.03)}
.lesson .lt{font-size:12px;letter-spacing:4px;text-transform:uppercase;color:var(--coral);margin-bottom:8px}
.cta{margin:40px 0;padding:28px;border-radius:16px;background:linear-gradient(135deg,rgba(255,107,87,.14),rgba(255,107,87,.04));border:1px solid rgba(255,107,87,.25)}
.cta h2{font-family:'Playfair Display',serif;font-weight:500;font-size:24px;margin-bottom:8px}
.cta p{color:var(--stone);margin-bottom:16px}
.cta form{display:flex;gap:10px;flex-wrap:wrap}
.cta input{flex:1;min-width:220px;padding:14px 16px;border-radius:10px;border:1px solid var(--line);background:#161618;color:var(--ivory);font:inherit;font-size:16px}
.cta button,.btn{padding:14px 22px;border-radius:10px;border:0;background:var(--coral);color:#1a0b08;font:inherit;font-weight:500;font-size:16px;cursor:pointer;text-decoration:none;display:inline-block}
.ok{color:var(--ivory);font-weight:400}
.also h2{font-family:'Playfair Display',serif;font-weight:500;font-size:22px;margin:40px 0 16px}
.also ul{list-style:none}
.also li{padding:12px 0;border-top:1px solid var(--line)}
.also a{text-decoration:none;display:block}
.also .k{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--coral)}
.also .t{font-family:'Playfair Display',serif;font-size:19px;margin-top:4px}
.also a:hover .t{color:var(--coral)}
footer{margin:50px 0 40px;padding-top:22px;border-top:1px solid var(--line);color:var(--stone);font-size:13px;line-height:1.6}
footer a{color:var(--stone)}
.langs{margin-top:12px;font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:1px}
.langs a{text-decoration:none;margin-right:10px}
.langs a.on{color:var(--coral)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin:26px 0 40px}
.card{display:block;text-decoration:none;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#131315}
.card img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:#161618}
.card .b{padding:16px 18px 20px}
.card .t{font-family:'Playfair Display',serif;font-size:20px;line-height:1.2;margin:6px 0 8px}
.card p{color:var(--stone);font-size:15px}
.card:hover .t{color:var(--coral)}
`;
const DIAMOND = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2 L31 18 L46 24 L31 30 L24 46 L17 30 L2 24 L17 18 Z" fill="#FF6B57"/></svg>`;

function shell({ lang, title, description, canonical, alternates, og, jsonld, body, i18n }) {
  const ui = UI[lang] || UI.en;
  const dir = RTL.has(lang) ? "rtl" : "ltr";
  const altLinks = alternates.map(([l, u]) => `<link rel="alternate" hreflang="${l}" href="${u}">`).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${alternates[0][1]}">`;
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
${altLinks}
<meta property="og:type" content="article"><meta property="og:site_name" content="Aeryndo"><meta property="og:locale" content="${LOCALE[lang] || "en_GB"}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400;500&family=Geist+Mono:wght@400;500&family=Noto+Sans+Arabic:wght@400;500&family=Noto+Sans+SC:wght@400;500&family=Noto+Sans+JP:wght@400;500&family=Noto+Sans+KR:wght@400;500&family=Noto+Sans+Devanagari:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body class="${lang}">
<div class="wrap">
<header><a class="brand" href="${SITE}/${lang === "fr" ? "" : "?lang=" + lang}">${DIAMOND}AERYNDO</a><nav><a href="${urlOf(lang)}">${esc(tr(i18n, lang, "navJournal"))}</a><a href="${SITE}/#deals">${esc(tr(i18n, lang, "navDeals"))}</a></nav></header>
${body}
<footer>${esc(ui.legal)} <a href="${SITE}/#legal">Aeryndo · AURUM GLOBAL HOLDING</a>
<div class="langs">${alternates.map(([l, u]) => `<a href="${u}" class="${l === lang ? "on" : ""}" hreflang="${l}">${l.toUpperCase()}</a>`).join("")}</div></footer>
</div>
<script>
function sub(f){var e=f.email.value.trim();if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(e))return false;fetch("/api/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,lang:"${lang}"})}).catch(function(){});f.innerHTML='<span class="ok">✓ '+e+'</span>';return false;}
</script>
</body></html>`;
}

function articlePage(a, lang, journal, i18n) {
  const x = text(a, lang), ui = UI[lang] || UI.en;
  const kind = a.kind === "piege" ? tr(i18n, lang, "jrPiege") : tr(i18n, lang, "jrGuide");
  const photo = SITE + "/api/photo?city=" + a.city;
  const body = x.body.map((p, i) => `<p${a.kind === "piege" && i === 0 ? ' class="detail"' : ""}>${esc(p)}</p>`).join("\n");
  const others = journal.filter(z => z.id !== a.id).sort((p, q) => (p.kind === a.kind ? -1 : 1) - (q.kind === a.kind ? -1 : 1)).slice(0, 4);
  const alternates = LANGS.map(l => [l, urlOf(l, a.id)]);
  const jsonld = {
    "@context": "https://schema.org", "@graph": [
      { "@type": "Article", "@id": urlOf(lang, a.id) + "#article", headline: x.t, description: x.lede, inLanguage: lang, image: [photo], url: urlOf(lang, a.id), mainEntityOfPage: urlOf(lang, a.id), dateModified: "2026-11-24", datePublished: "2026-11-04",
        author: { "@type": "Organization", name: "Aeryndo", url: SITE + "/" }, publisher: { "@type": "Organization", name: "Aeryndo", logo: { "@type": "ImageObject", url: SITE + "/og.png" } } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Aeryndo", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: tr(i18n, lang, "navJournal"), item: urlOf(lang) },
        { "@type": "ListItem", position: 3, name: x.t, item: urlOf(lang, a.id) }] }
    ]
  };
  const html = `
<div class="crumb"><a href="${SITE}/">${esc(ui.home)}</a> › <a href="${urlOf(lang)}">${esc(tr(i18n, lang, "navJournal"))}</a> › ${esc(kind)}</div>
<article>
<div class="kicker">${esc(x.k)}</div>
<h1>${esc(x.t)}</h1>
<p class="lede">${esc(x.lede)}</p>
<div class="meta"><span>${esc(ui.by)}</span><span>${esc(tr(i18n, lang, "jrMin").replace("{n}", a.min))}</span></div>
<figure><img src="${photo}" alt="${esc(x.t)}" loading="lazy" onerror="this.parentNode.style.display='none'"></figure>
${x.q ? `<blockquote>${esc(x.q)}</blockquote>` : ""}
${body}
<div class="lesson"><div class="lt">${esc(tr(i18n, lang, "jrLesson"))}</div>${esc(x.lesson)}</div>
</article>
<section class="cta"><h2>${esc(tr(i18n, lang, "alertH2"))}</h2><p>${esc(tr(i18n, lang, "alertNote"))}</p>
<form onsubmit="return sub(this)"><input type="email" name="email" required placeholder="${esc(tr(i18n, lang, "alertPh"))}" aria-label="email"><button type="submit">${esc(tr(i18n, lang, "alertBtn"))}</button></form>
<p style="margin:14px 0 0"><a class="btn" style="background:transparent;border:1px solid var(--line);color:var(--ivory)" href="${SITE}/#deals">${esc(ui.deals)} →</a></p></section>
<section class="also"><h2>${esc(ui.also)}</h2><ul>${others.map(o => { const y = text(o, lang); return `<li><a href="${urlOf(lang, o.id)}"><div class="k">${esc(o.kind === "piege" ? tr(i18n, lang, "jrPiege") : tr(i18n, lang, "jrGuide"))}</div><div class="t">${esc(y.t)}</div></a></li>`; }).join("")}</ul></section>`;
  return shell({ lang, title: x.t + " — Aeryndo", description: x.lede, canonical: urlOf(lang, a.id), alternates, og: photo, jsonld, body: html, i18n });
}

function indexPage(lang, journal, i18n) {
  const ui = UI[lang] || UI.en;
  const alternates = LANGS.map(l => [l, urlOf(l)]);
  const title = tr(i18n, lang, "jrKick") + " — Aeryndo";
  const intro = tr(i18n, lang, "jrIntro");
  const jsonld = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description: intro, url: urlOf(lang), inLanguage: lang,
    hasPart: journal.map(a => ({ "@type": "Article", headline: text(a, lang).t, url: urlOf(lang, a.id) })) };
  const html = `
<div class="crumb"><a href="${SITE}/">${esc(ui.home)}</a> › ${esc(tr(i18n, lang, "navJournal"))}</div>
<div class="kicker">${esc(tr(i18n, lang, "jrKick"))}</div>
<h1>${tr(i18n, lang, "jrH2")}</h1>
<p class="lede">${esc(intro)}</p>
<div class="grid">${journal.map(a => { const x = text(a, lang); return `<a class="card" href="${urlOf(lang, a.id)}"><img src="${SITE}/api/photo?city=${a.city}" alt="" loading="lazy"><div class="b"><div class="k" style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--coral)">${esc(a.kind === "piege" ? tr(i18n, lang, "jrPiege") : tr(i18n, lang, "jrGuide"))} · ${esc(tr(i18n, lang, "jrMin").replace("{n}", a.min))}</div><div class="t">${esc(x.t)}</div><p>${esc(x.lede)}</p></div></a>`; }).join("")}</div>
<section class="cta"><h2>${esc(tr(i18n, lang, "alertH2"))}</h2><p>${esc(tr(i18n, lang, "alertNote"))}</p>
<form onsubmit="return sub(this)"><input type="email" name="email" required placeholder="${esc(tr(i18n, lang, "alertPh"))}" aria-label="email"><button type="submit">${esc(tr(i18n, lang, "alertBtn"))}</button></form></section>`;
  return shell({ lang, title, description: intro, canonical: urlOf(lang), alternates, og: SITE + "/og.png", jsonld, body: html, i18n });
}

module.exports = (req, res) => {
  const q = req.query || {};
  const lang = LANGS.includes(String(q.lang || "")) ? String(q.lang) : "fr";
  const id = String(q.id || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  let data;
  try { data = load(); } catch (e) { res.statusCode = 500; return res.end("journal indisponible"); }
  if (!id) {
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.end(indexPage(lang, data.journal, data.i18n));
  }
  const a = data.journal.find(z => z.id === id);
  if (!a) { res.statusCode = 404; res.setHeader("Cache-Control", "public, s-maxage=600"); return res.end(`<!doctype html><meta charset="utf-8"><title>404</title><p style="font-family:sans-serif;padding:40px">Article introuvable — <a href="${urlOf(lang)}">journal</a></p>`); }
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.end(articlePage(a, lang, data.journal, data.i18n));
};
module.exports.LANGS = LANGS;
module.exports.load = load;
module.exports.urlOf = urlOf;
