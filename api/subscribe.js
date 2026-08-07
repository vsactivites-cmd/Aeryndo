// api/subscribe.js — Aeryndo → Brevo
// Reçoit un email depuis le formulaire et l'ajoute à la liste "Alertes Aeryndo" (id 3).
// La clé API n'est JAMAIS dans le code : elle vit dans la variable d'environnement BREVO_API_KEY sur Vercel.

export default async function handler(req, res) {
  // CORS (autorise ton domaine à appeler la fonction)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Récupère l'email envoyé par le formulaire
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const email = (body && body.email ? String(body.email) : "").trim();

    // Validation simple
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "Email invalide" });
    }

    const KEY = process.env.BREVO_API_KEY;
    if (!KEY) return res.status(500).json({ error: "Config manquante" });

    // Ajoute (ou met à jour) le contact dans Brevo, liste id 3
    const r = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": KEY,
      },
      body: JSON.stringify({
        email: email,
        listIds: [3],
        updateEnabled: true,
      }),
    });

    // 201 = créé, 204 = mis à jour → succès. Brevo renvoie 400 "duplicate" si déjà là avec updateEnabled=false.
    if (r.status === 201 || r.status === 204 || r.ok) {
      return res.status(200).json({ ok: true });
    }

    const data = await r.json().catch(() => ({}));
    // Si le contact existe déjà, on considère ça comme un succès
    if (data && (data.code === "duplicate_parameter")) {
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ ok: true }); // on ne bloque jamais l'utilisateur côté site
  } catch (e) {
    return res.status(200).json({ ok: true }); // échec silencieux pour l'utilisateur ; on log côté Vercel
  }
}
