// ============================================================
// AERYNDO — le vérificateur en temps réel, choisi selon les clés présentes
//
//   1. SERPAPI_KEY                              → Google Flights via SerpApi (recommandé, gratuit 250/mois)
//   2. AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET → Amadeus (clients Enterprise seulement depuis juillet 2026)
//   3. aucune clé                               → pas de vérification : aucun deal n'est publié (voulu)
//
// Les deux modules ont la même interface : search(from, to, dep, ret) → { ok, price, carrier,
// carriers, segments[], stops, allBusiness } ; scan.js ne connaît que celle-ci.
// ============================================================
const G = require("./_google.js");
const A = require("./_amadeus.js");

const provider = G.ENABLED ? "google" : A.ENABLED ? "amadeus" : null;
const impl = provider === "google" ? G : provider === "amadeus" ? A : null;

// Budget quotidien par défaut : 250/mois chez SerpApi → 8 par jour ; Amadeus ≈ 2 000/mois → 60.
const DEFAULT_DAILY_CAP = provider === "google" ? 8 : 60;

module.exports = {
  ENABLED: Boolean(impl),
  NAME: provider || "absent",
  LABEL: provider === "google" ? "Google Flights" : provider === "amadeus" ? "Amadeus" : null,
  TOLERANCE: impl ? impl.TOLERANCE : 1.10,
  DEFAULT_DAILY_CAP,
  search: (from, to, dep, ret, opts) => impl ? impl.search(from, to, dep, ret, opts) : Promise.resolve({ ok: false, error: "aucun vérificateur configuré" })
};
