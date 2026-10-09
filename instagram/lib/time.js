// Marchés et créneaux de publication. Chaque marché = un compte Instagram, un fuseau horaire,
// des aéroports de départ (les deals postés partent de là), des langues et ses propres créneaux
// EN HEURE LOCALE du marché (décision du 9 oct. 2026 pour la France :
//   mardi 18 h 30 piège · vendredi 12 h 30 deal · dimanche 10 h 30 Reel · story 2 h après chaque post).
// Le workflow GitHub tourne en UTC toutes les heures à :30 ; ce fichier dit, pour chaque marché,
// si l'heure locale tombe dans une fenêtre de publication (± 40 min). Ajouter un marché = ajouter
// une entrée dans content/markets.json (+ le jeton du compte dans les secrets) — rien d'autre.
const fs = require("fs");
const path = require("path");

const MARKETS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "markets.json"), "utf8"));
function market(id) { const m = MARKETS.find(x => x.id === (id || "fr")); if (!m) throw new Error("marché inconnu " + id); return m; }

function localParts(tz, date) {
  const d = date || new Date();
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = {}; for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: days[p.weekday], hour: Number(p.hour) % 24, minute: Number(p.minute), date: `${p.year}-${p.month}-${p.day}`, tz };
}
const parisParts = date => localParts("Europe/Paris", date);

// Le créneau courant d'un marché, ou null si on n'est pas dans une fenêtre de publication.
function currentSlot(m, date) {
  const now = localParts(m.tz, date);
  const minutes = now.hour * 60 + now.minute;
  for (const s of m.slots) {
    if (s.day !== now.day) continue;
    if (Math.abs(minutes - (s.hour * 60 + s.minute)) <= 40) return Object.assign({ date: now.date, market: m.id }, s);
  }
  return null;
}
function slotById(m, id, date) { const s = m.slots.find(x => x.id === id); return s ? Object.assign({ date: localParts(m.tz, date).date, market: m.id }, s) : null; }

// Tous les (marché, créneau) actifs maintenant
function dueNow(date) { return MARKETS.map(m => ({ market: m, slot: currentSlot(m, date) })).filter(x => x.slot); }

module.exports = { MARKETS, market, localParts, parisParts, currentSlot, slotById, dueNow };
