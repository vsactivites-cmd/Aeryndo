// SONDE TEMPORAIRE — teste quels endpoints Travelpayouts acceptent la classe Business.
// À supprimer une fois la source choisie.
const crypto = require("crypto");
const D = require("./_data.js");

module.exports = async (req, res) => {
  const token = process.env.TP_API_TOKEN;
  if (!token) return D.sendJson(res, 200, { ok: false, error: "no token" });
  const base = { currency: "eur", origin: "CDG", destination: "JFK" };
  const tests = [
    ["latest tc=1", "/v2/prices/latest", Object.assign({}, base, { trip_class: 1, period_type: "year", limit: 5 })],
    ["latest tc=C", "/v2/prices/latest", Object.assign({}, base, { trip_class: "C", period_type: "year", limit: 5 })],
    ["latest no tc", "/v2/prices/latest", Object.assign({}, base, { period_type: "year", limit: 5 })],
    ["calendar tc=1", "/v1/prices/calendar", Object.assign({}, base, { depart_date: "2026-10", trip_class: 1, calendar_type: "departure_date" })],
    ["cheap tc=1", "/v1/prices/cheap", Object.assign({}, base, { depart_date: "2026-10", trip_class: 1 })],
    ["direct tc=1", "/v1/prices/direct", Object.assign({}, base, { depart_date: "2026-10", trip_class: 1 })],
    ["month-matrix tc=1", "/v2/prices/month-matrix", Object.assign({}, base, { month: "2026-10-01", trip_class: 1, show_to_affiliates: "true" })],
    ["week-matrix tc=1", "/v2/prices/week-matrix", Object.assign({}, base, { depart_date: "2026-10-12", return_date: "2026-10-20", trip_class: 1, show_to_affiliates: "true" })],
    ["nearest tc=1", "/v2/prices/nearest-places-matrix", Object.assign({}, base, { depart_date: "2026-10-12", return_date: "2026-10-20", trip_class: 1, show_to_affiliates: "true" })],
    ["v3 prices_for_dates tc=1", "/aviasales/v3/prices_for_dates", Object.assign({}, base, { departure_at: "2026-10", trip_class: 1, limit: 5, token })],
    ["v3 prices_for_dates tc=C", "/aviasales/v3/prices_for_dates", Object.assign({}, base, { departure_at: "2026-10", trip_class: "C", limit: 5, token })],
    ["v3 get_latest_prices tc=1", "/aviasales/v3/get_latest_prices", Object.assign({}, base, { trip_class: 1, limit: 5, token })],
    ["v3 grouped_prices tc=1", "/aviasales/v3/grouped_prices", Object.assign({}, base, { departure_at: "2026-10", group_by: "departure_at", trip_class: 1, token })]
  ];
  const out = {};
  for (const [name, path, params] of tests) {
    const r = await D.tpFetch(path, params, token);
    let sample = null, classes = null;
    if (r.ok && r.data) {
      const d = r.data.data;
      const arr = Array.isArray(d) ? d : (d && typeof d === "object" ? Object.values(d) : []);
      sample = arr.slice(0, 2);
      classes = [...new Set(arr.map(x => x && x.trip_class).filter(x => x !== undefined))];
      out[name] = { status: 200, count: arr.length, classes, sample };
    } else out[name] = { status: r.status, error: (r.error || "").slice(0, 160) };
  }
  // Flight Search API (ancienne version, accès sur demande) : POST signé
  try {
    const p = { host: "aeryndo.co", locale: "fr", marker: D.MARKER, passengers: { adults: 1, children: 0, infants: 0 }, segments: [{ date: "2026-10-12", destination: "JFK", origin: "CDG" }], trip_class: "C", user_ip: "127.0.0.1" };
    const sig = crypto.createHash("md5").update([token, p.host, p.locale, p.marker, 1, 0, 0, "2026-10-12", "JFK", "CDG", "C", p.user_ip].join(":")).digest("hex");
    const resp = await fetch("https://api.travelpayouts.com/v1/flight_search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ signature: sig }, p)) });
    const body = await resp.text();
    out["flight_search v1 POST"] = { status: resp.status, body: body.slice(0, 300) };
  } catch (e) { out["flight_search v1 POST"] = { error: String(e) }; }
  // Appels internes des handlers (avec query) — vérification de bout en bout
  const call = async (h, query) => { const o = { status: 0, body: "" }; const r = { setHeader() {}, status(c) { o.status = c; return r; }, end(b) { o.body = b; } }; await h({ query, headers: {} }, r); return { status: o.status, body: JSON.parse(o.body) }; };
  const search = require("./search.js"), catalog = require("./catalog.js");
  const s1 = await call(search, { from: "CDG", to: "JFK", oneway: "0", month: "2026-11" });
  out["search CDG-JFK RT"] = { status: s1.status, count: s1.body.count, months: s1.body.months, first3: (s1.body.offers || []).slice(0, 3), normal: s1.body.normal, error: s1.body.error };
  const s2 = await call(search, { from: "CDG", to: "SIN", oneway: "1", month: "2026-10" });
  out["search CDG-SIN OW"] = { status: s2.status, count: s2.body.count, first2: (s2.body.offers || []).slice(0, 2), error: s2.body.error };
  const c1 = await call(catalog, { q: "tok", locale: "fr" });
  out["catalog q=tok"] = { status: c1.status, results: (c1.body.results || []).slice(0, 4), error: c1.body.error };
  D.sendJson(res, 200, out);
};
