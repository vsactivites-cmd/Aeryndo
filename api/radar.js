// ============================================================
// RADAR AERYNDO — surveillance nocturne des tarifs Business
// Interroge l'API de données Travelpayouts sur les routes cibles,
// détecte les prix anormalement bas, envoie une alerte via Brevo.
// Déclenché chaque nuit par le cron Vercel (voir vercel.json).
// ============================================================

const ROUTES = [
  { o: "CDG", d: "JFK", city: "New York",  normal: 2600 },
  { o: "CDG", d: "DXB", city: "Duba\u00ef",     normal: 2400 },
  { o: "CDG", d: "HND", city: "Tokyo",     normal: 3200 },
  { o: "CDG", d: "NRT", city: "Tokyo Narita", normal: 3200 },
  { o: "CDG", d: "BKK", city: "Bangkok",   normal: 2800 },
  { o: "CDG", d: "SIN", city: "Singapour", normal: 3000 },
  { o: "NCE", d: "JFK", city: "New York (dep. Nice)", normal: 2800 }
];

// Seuil d'alerte : prix <= 65 % de la normale de la route
const THRESHOLD = 0.65;
const MARKER = "545278.radar";

function dm(iso) { // "2026-09-15" -> "1509"
  const [y, m, d] = iso.split("-");
  return d + m;
}

function dealLink(o, d, dep, ret) {
  const path = o + dm(dep) + d + (ret ? dm(ret) : "") + "C1";
  return `https://www.aviasales.fr/search/${path}?marker=${MARKER}&currency=eur&trip_class=C`;
}

async function fetchRoute(token, r) {
  const url =
    "https://api.travelpayouts.com/v2/prices/latest" +
    `?currency=eur&origin=${r.o}&destination=${r.d}` +
    "&trip_class=1&period_type=year&page=1&limit=30&sorting=price";
  const resp = await fetch(url, { headers: { "X-Access-Token": token } });
  if (!resp.ok) return { route: r, error: "HTTP " + resp.status, offers: [] };
  const json = await resp.json();
  const today = new Date().toISOString().slice(0, 10);
  const offers = (json.data || [])
    .filter(x => x.value && x.depart_date && x.depart_date > today)
    .map(x => ({
      price: Math.round(x.value),
      dep: x.depart_date,
      ret: x.return_date || null
    }));
  return { route: r, error: null, offers };
}

function euros(n) {
  return n.toLocaleString("fr-FR") + " \u20ac";
}

function buildEmail(hits) {
  const rows = hits.map(h => {
    const pct = Math.round((1 - h.best.price / h.route.normal) * 100);
    const link = dealLink(h.route.o, h.route.d, h.best.dep, h.best.ret);
    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a2e;">
          <div style="font-size:18px;color:#F3F0E9;">${h.route.o} \u2192 ${h.route.d} \u00b7 ${h.route.city}</div>
          <div style="font-size:13px;color:#b8b3aa;margin-top:4px;">D\u00e9part ${h.best.dep}${h.best.ret ? " \u00b7 retour " + h.best.ret : ""}</div>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #2a2a2e;text-align:right;">
          <div style="font-size:20px;color:#FF6B57;">${euros(h.best.price)}</div>
          <div style="font-size:12px;color:#b8b3aa;">\u2212${pct}% vs normale (${euros(h.route.normal)})</div>
          <a href="${link}" style="font-size:12px;color:#F3F0E9;">V\u00e9rifier \u2192</a>
        </td>
      </tr>`;
  }).join("");

  return `
  <div style="background:#0E0E0F;padding:32px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="font-size:22px;letter-spacing:4px;color:#F3F0E9;">AERYNDO</div>
      <div style="font-size:11px;letter-spacing:3px;color:#FF6B57;margin:6px 0 24px;">RADAR \u00b7 RAPPORT DE NUIT</div>
      <p style="color:#b8b3aa;font-size:14px;line-height:1.6;">
        Le radar a d\u00e9tect\u00e9 ${hits.length} tarif(s) Business sous le seuil d'alerte.
        \u00c0 v\u00e9rifier \u00e0 la main avant toute publication : disponibilit\u00e9, compagnie, vraie cabine.
      </p>
      <table style="width:100%;border-collapse:collapse;background:#161516;">${rows}</table>
      <p style="color:#8f8a82;font-size:11px;margin-top:20px;">
        Seuil : ${Math.round(THRESHOLD * 100)}% de la normale par route \u00b7 donn\u00e9es Travelpayouts \u00b7 liens marqu\u00e9s ${MARKER}
      </p>
    </div>
  </div>`;
}

async function sendEmail(apiKey, html, subject) {
  const to = process.env.ALERT_EMAIL || "contact@aeryndo.co";
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { name: "Radar Aeryndo", email: "contact@aeryndo.co" },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html
    })
  });
  return resp.ok;
}

module.exports = async (req, res) => {
  const token = process.env.TP_API_TOKEN;
  const brevo = process.env.BREVO_API_KEY;
  const isTest = req.query && req.query.test === "1";

  if (!token) return res.status(500).json({ ok: false, error: "TP_API_TOKEN manquant dans Vercel" });
  if (!brevo) return res.status(500).json({ ok: false, error: "BREVO_API_KEY manquant dans Vercel" });

  const results = [];
  for (const r of ROUTES) {
    try { results.push(await fetchRoute(token, r)); }
    catch (e) { results.push({ route: r, error: String(e), offers: [] }); }
  }

  const hits = [];
  for (const r of results) {
    if (!r.offers.length) continue;
    const best = r.offers.reduce((a, b) => (a.price <= b.price ? a : b));
    if (best.price <= r.route.normal * THRESHOLD) hits.push({ route: r.route, best });
  }

  let emailed = false;
  if (hits.length) {
    emailed = await sendEmail(brevo, buildEmail(hits), `\u2708 Radar Aeryndo \u2014 ${hits.length} tarif(s) sous le seuil`);
  } else if (isTest) {
    emailed = await sendEmail(
      brevo,
      buildEmail([]).replace("0 tarif(s) Business sous le seuil d'alerte", "aucun tarif sous le seuil cette nuit \u2014 test de bon fonctionnement r\u00e9ussi"),
      "\u2708 Radar Aeryndo \u2014 test OK, radar op\u00e9rationnel"
    );
  }

  res.status(200).json({
    ok: true,
    scanned: ROUTES.length,
    routesAvecDonnees: results.filter(r => r.offers.length).length,
    alertes: hits.map(h => ({ route: h.route.o + "-" + h.route.d, prix: h.best.price, normale: h.route.normal })),
    emailEnvoye: emailed
  });
};
