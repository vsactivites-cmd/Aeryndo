// ============================================================
// Les refus du robot, formulés pour le public (v10, 25 nov. 2026)
//
// Le scan journalise chaque motif de refus tel quel (scan:refused, voir api/scan.js). Ici on en fait des
// phrases lisibles FR/EN pour les emails (« le deal + le refusé ») et, demain, pour le site. Le robot
// Instagram a sa propre copie de ces règles (instagram/lib/content.js, parseRefusal) : garder les deux en accord.
// ============================================================
const RULES = [
  [/prix en direct (\d[\d\s]*) € vs (\d[\d\s]*) € annoncé/, m => ({ fr: `annoncé ${num(m[2])} €, en réalité ${num(m[1])} € à l’écran de paiement`, en: `advertised €${numEn(m[2])}, actually €${numEn(m[1])} at checkout` })],
  [/prix en direct (\d[\d\s]*) € : hors charte/, m => ({ fr: `${num(m[1])} € à l’écran de paiement : au-dessus de notre plafond pour cette route`, en: `€${numEn(m[1])} at checkout: above our ceiling for this route` })],
  [/sans lit à plat/, () => ({ fr: "fauteuil inclinable sur le long-courrier, pas un lit", en: "recliner on the long haul, not a bed" })],
  [/cabine mixte/, () => ({ fr: "un tronçon hors Business", en: "one leg not in Business" })],
  [/départ imminent/, () => ({ fr: "départ trop proche pour être réservé sereinement", en: "departure too soon to book calmly" })],
  [/aucun tarif en direct|introuvable/, () => ({ fr: "tarif introuvable à l’écran de paiement", en: "fare not found at checkout" })],
  [/plus de (\d+) h/, m => ({ fr: `plus de ${m[1]} h de vol pour ce prix : hors charte`, en: `over ${m[1]} h of flying for that price: outside our rules` })]
];
const num = s => Number(String(s).replace(/\s/g, "")).toLocaleString("fr-FR").replace(/ | /g, " ");
const numEn = s => Number(String(s).replace(/\s/g, "")).toLocaleString("en-GB");

// { text: "PAR-MLE (Premium Flights, annoncé 1680 €) : prix en direct 2184 € vs 1680 € annoncé (> +10 %)" }
//   → { from, to, src, reason: { fr, en }, at }
function parse(r) {
  const m = /^([A-Z]{3})-([A-Z]{3})(?: \(([^)]*)\))?(?: \(re-contrôle\))? : (.*)$/.exec(String((r && r.text) || "").trim());
  if (!m) return null;
  const src = m[3] && !/re-contrôle/.test(m[3]) ? m[3].split(",")[0].trim() : null;
  let reason = null;
  for (const [re, fn] of RULES) { const x = re.exec(m[4]); if (x) { reason = fn(x); break; } }
  if (!reason) return null;
  return { from: m[1], to: m[2], src, reason, at: (r && r.at) || null };
}

// Les n refus les plus récents, une route au plus par refus, à partir du journal scan:refused.
function pick(list, n) {
  const seen = new Set(), out = [];
  for (const r of (Array.isArray(list) ? list : []).slice().sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))) {
    const p = parse(r); if (!p) continue;
    const k = p.from + "-" + p.to; if (seen.has(k)) continue; seen.add(k);
    out.push(p); if (out.length >= n) break;
  }
  return out;
}

module.exports = { parse, pick, RULES };
