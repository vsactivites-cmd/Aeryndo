// ============================================================
// AERYNDO — le palmarès : deals passés, réellement dénichés et vérifiés
//
// Chaque entrée est un tarif vu à l'écran de paiement à la date indiquée (foundAt).
// Formulation sur le site : « déniché le … — X € au lieu de ~Y € habituellement ».
// On ne prétend jamais qu'un visiteur a réservé : on montre ce que la chasse a trouvé.
// « was » = tarif habituel constaté sur la route à la même période (ordre de grandeur,
// d'où le tilde à l'affichage). Servi par /api/deals (champ « palmares ») et réutilisé
// par le robot Instagram.
// ============================================================

const LIST = [
  {
    id: "beond-cdg-mle-2026-08", from: "CDG", to: "MLE", cityCode: "MLE",
    city: { fr: "Maldives", en: "Maldives" },
    carrier: "B4", carrierName: "Beond", aircraft: ["319"], stops: 0,
    price: 3198, was: 4982, foundAt: "2026-08-21", dep: "2027-02-07", ret: "2027-02-20",
    seat: { kind: "flat", fr: "Avion 100 % Business : lit entièrement à plat sur tout le vol.", en: "All-Business aircraft: fully flat bed for the whole flight." },
    note: { fr: "Paris → Malé en direct, cabine 100 % Business.", en: "Paris → Malé nonstop, all-Business cabin." }
  },
  {
    id: "lacompagnie-ory-ewr-2026-08", from: "ORY", to: "EWR", cityCode: "NYC",
    city: { fr: "New York", en: "New York" },
    carrier: "B0", carrierName: "La Compagnie", aircraft: ["32Q"], stops: 0,
    price: 2012, was: 2422, foundAt: "2026-08-21", dep: "2026-09-25", ret: "2026-10-11",
    seat: { kind: "flat", fr: "Lit entièrement à plat, cabine 100 % Business (A321neo).", en: "Fully flat bed, all-Business cabin (A321neo)." },
    note: { fr: "Orly → Newark en direct.", en: "Orly → Newark nonstop." }
  },
  {
    id: "etihad-cdg-hkg-2026-08", from: "CDG", to: "HKG", cityCode: "HKG",
    city: { fr: "Hong Kong", en: "Hong Kong" },
    carrier: "EY", carrierName: "Etihad", aircraft: ["388", "789"], stops: 1,
    price: 2413, was: 3388, foundAt: "2026-08-21", dep: "2026-09-25", ret: "2026-10-04",
    seat: { kind: "flat", fr: "Lit entièrement à plat sur les deux tronçons (Business Studio, A380 + 787).", en: "Fully flat bed on both legs (Business Studio, A380 + 787)." },
    note: { fr: "Via Abu Dhabi.", en: "Via Abu Dhabi." }
  },
  {
    id: "kenya-cdg-mru-2026-09", from: "CDG", to: "MRU", cityCode: "MRU",
    city: { fr: "Île Maurice", en: "Mauritius" },
    carrier: "KQ", carrierName: "Kenya Airways", aircraft: ["788"], stops: 1,
    price: 2493, was: 3580, foundAt: "2026-09-01", dep: "2026-10-19", ret: "2026-10-27",
    seat: { kind: "partial", fr: "Lit à plat (787) sur les vols de nuit ; siège inclinable sur le saut de 4 h en journée via Nairobi.", en: "Flat bed (787) on the night flights; recliner on the 4-hour daytime hop via Nairobi." },
    note: { fr: "Via Nairobi, bagages et taxes compris.", en: "Via Nairobi, bags and taxes included." }
  }
];

// Liste publique : triée du plus récent au plus ancien, avec la remise calculée.
function list() {
  return LIST.slice().sort((a, b) => b.foundAt.localeCompare(a.foundAt)).map(d => Object.assign({}, d, {
    discount: d.was > d.price ? Math.round((1 - d.price / d.was) * 100) : null,
    photo: "/api/photo?city=" + d.cityCode
  }));
}

module.exports = { LIST, list };
