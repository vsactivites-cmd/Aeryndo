// /sitemap.xml — accueil + journal (sommaires et articles, 12 langues). v10-seo, 24 nov. 2026.
const J = require("./journal.js");
module.exports = (req, res) => {
  let journal = [];
  try { journal = J.load().journal; } catch (e) { journal = []; }
  const urls = [{ loc: "https://aeryndo.co/", pri: "1.0", freq: "daily" }];
  for (const l of J.LANGS) urls.push({ loc: J.urlOf(l), pri: "0.7", freq: "weekly" });
  for (const a of journal) for (const l of J.LANGS) urls.push({ loc: J.urlOf(l, a.id), pri: l === "fr" || l === "en" ? "0.8" : "0.5", freq: "monthly", alts: J.LANGS.map(x => [x, J.urlOf(x, a.id)]) });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority>${(u.alts || []).map(([l, h]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${h}"/>`).join("")}</url>`).join("\n")}
</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.end(xml);
};
