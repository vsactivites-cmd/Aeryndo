// Publication via l'API Instagram. Deux « portes » possibles, même grammaire :
//   • graph.instagram.com  (connexion Instagram — historique)            → graph("instagram")
//   • graph.facebook.com   (connexion Facebook, via la Page — v8)         → graph("facebook")
//   carrousel : 1 conteneur par image (is_carousel_item) → conteneur CAROUSEL → media_publish
//   reel      : conteneur REELS (video_url + cover_url [+ audio_configuration]) → attendre FINISHED → media_publish
//   story     : conteneur STORIES (image_url) → media_publish
// Les médias doivent être des URL publiques (branche `media` du dépôt GitHub, servie par raw.githubusercontent.com).
// Paramètres envoyés en x-www-form-urlencoded (forme documentée par Meta). Version d'API : IG_API_VERSION (v23.0 par défaut).
// Jeton (porte Instagram) : lu sur Vercel (/api/igtoken, déposé par un rafraîchissement précédent) sinon dans le secret
// GitHub ; rafraîchi s'il reste < 15 jours ou si sa date est inconnue, puis déposé sur Vercel → jamais à ressaisir.
// La porte Facebook (jeton de Page permanent, musique des Reels) est dans facebook.js.
const VERSION = (process.env.IG_API_VERSION || "v23.0").trim();
const BASES = {
  instagram: (process.env.IG_GRAPH_BASE || "https://graph.instagram.com").replace(/\/$/, ""), // surchargé seulement pour les tests
  facebook: (process.env.FB_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "")
};

const form = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]));
const q = o => form(o).toString();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined, body: body ? form(body) : undefined });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok || j.error) throw new Error("Instagram " + r.status + " " + (j.error ? j.error.message + " (code " + j.error.code + (j.error.error_subcode ? "/" + j.error.error_subcode : "") + ")" : txt.slice(0, 300)));
  return j;
}

// Une « porte » = un hôte Graph + sa version. Les fonctions sont identiques, seule l'adresse change.
function graph(gate) {
  const BASE = BASES[gate] || BASES.instagram;
  const G = BASE + "/" + VERSION;

  async function waitReady(id, token, maxMs) {
    const t0 = Date.now();
    for (;;) {
      const s = await call("GET", `${G}/${id}?${q({ fields: "status_code,status", access_token: token })}`);
      if (s.status_code === "FINISHED") return s;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("conteneur " + id + " en erreur : " + (s.status || s.status_code));
      if (Date.now() - t0 > (maxMs || 10 * 60000)) throw new Error("conteneur " + id + " toujours pas prêt (" + s.status_code + ")");
      await sleep(20000); // limite API : 200 appels / heure / compte
    }
  }

  async function publishCarousel(ig, token, imageUrls, caption) {
    const children = [];
    for (const u of imageUrls) {
      const c = await call("POST", `${G}/${ig}/media`, { image_url: u, is_carousel_item: "true", access_token: token });
      children.push(c.id);
    }
    for (const id of children) await waitReady(id, token, 4 * 60000);
    const parent = await call("POST", `${G}/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, access_token: token });
    await waitReady(parent.id, token, 4 * 60000);
    return call("POST", `${G}/${ig}/media_publish`, { creation_id: parent.id, access_token: token });
  }

  // audio = { id, volume?, videoVolume? } (catalogue Instagram, porte Facebook uniquement). Si Meta refuse le conteneur
  // avec musique, ou si son traitement échoue, on republie SANS musique plutôt que de rater le créneau.
  async function publishReel(ig, token, videoUrl, coverUrl, caption, audio, log) {
    const base = { media_type: "REELS", video_url: videoUrl, cover_url: coverUrl, caption, share_to_feed: "true", access_token: token };
    const say = (...a) => { if (log) log(...a); };
    let container = null, withAudio = false, audioError = null;
    if (audio && audio.id) {
      const cfg = JSON.stringify({ audio_id: String(audio.id), audio_volume: audio.volume == null ? 100 : audio.volume, video_volume: audio.videoVolume == null ? 0 : audio.videoVolume });
      try {
        const c = await call("POST", `${G}/${ig}/media`, Object.assign({ audio_configuration: cfg }, base));
        await waitReady(c.id, token, 12 * 60000);
        container = c; withAudio = true;
      } catch (e) { audioError = e.message; say("Reel avec musique refusé (" + e.message + ") — nouvel essai sans musique"); }
    }
    if (!container) {
      container = await call("POST", `${G}/${ig}/media`, base);
      await waitReady(container.id, token, 12 * 60000);
    }
    const pub = await call("POST", `${G}/${ig}/media_publish`, { creation_id: container.id, access_token: token });
    pub.audio = withAudio ? { id: String(audio.id), title: audio.title || null, artist: audio.artist || null } : null;
    if (audioError) pub.audioError = audioError;
    return pub;
  }

  async function publishStory(ig, token, imageUrl) {
    const c = await call("POST", `${G}/${ig}/media`, { media_type: "STORIES", image_url: imageUrl, access_token: token });
    await waitReady(c.id, token, 4 * 60000);
    return call("POST", `${G}/${ig}/media_publish`, { creation_id: c.id, access_token: token });
  }

  async function permalink(mediaId, token) { try { const j = await call("GET", `${G}/${mediaId}?${q({ fields: "permalink", access_token: token })}`); return j.permalink; } catch { return null; } }

  // Porte Instagram : /me renvoie `id` (identifiant « côté app ») et `user_id` (identifiant du compte professionnel, 1784…).
  // Les appels de publication se font sur l'identifiant renvoyé ici.
  async function me(token) {
    const j = await call("GET", `${G}/me?${q({ fields: "id,user_id,username", access_token: token })}`);
    return { id: String(j.id || ""), userId: String(j.user_id || ""), username: j.username || "", target: String(j.user_id || j.id) };
  }

  return { gate, BASE, G, call, q, waitReady, publishCarousel, publishReel, publishStory, permalink, me };
}

const IG = graph("instagram");

// ---------- jeton de la porte Instagram : lecture (Vercel d'abord, secret GitHub sinon) et rafraîchissement ----------
async function loadToken(m) {
  const key = process.env.CRON_SECRET;
  if (key) {
    try {
      const r = await fetch(`${m.site}/api/igtoken?key=${encodeURIComponent(key)}&market=${m.id}`);
      if (r.ok) { const j = await r.json(); if (j.ok && j.token) return { token: j.token, expiresAt: j.expiresAt || null, from: "vercel" }; }
    } catch { }
  }
  const t = process.env[m.tokenEnv || "IG_ACCESS_TOKEN"];
  if (!t) throw new Error("aucun jeton Instagram pour le marché " + m.id + " (secret " + (m.tokenEnv || "IG_ACCESS_TOKEN") + " absent)");
  return { token: t.trim(), expiresAt: null, from: "env" };
}
async function refreshIfNeeded(m, tk, log) {
  const daysLeft = tk.expiresAt ? (Date.parse(tk.expiresAt) - Date.now()) / 86400000 : null;
  if (daysLeft != null && daysLeft > 15) return tk;
  if (daysLeft != null && daysLeft < 0) throw new Error("jeton Instagram expiré depuis le " + tk.expiresAt.slice(0, 10) + " — Meta ne rafraîchit pas un jeton expiré : en générer un nouveau et le mettre dans le secret GitHub IG_ACCESS_TOKEN");
  // date inconnue (secret GitHub, ou dépôt manuel) ou < 15 j : on tente le rafraîchissement
  try {
    const j = await call("GET", `${BASES.instagram}/refresh_access_token?${q({ grant_type: "ig_refresh_token", access_token: tk.token })}`);
    const expiresAt = new Date(Date.now() + (j.expires_in || 5184000) * 1000).toISOString();
    if (process.env.CRON_SECRET) {
      const r = await fetch(`${m.site}/api/igtoken?key=${encodeURIComponent(process.env.CRON_SECRET)}&market=${m.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: j.access_token, expiresAt }) });
      if (!r.ok) throw new Error("dépôt du jeton sur Vercel refusé : HTTP " + r.status);
    }
    log("jeton rafraîchi, valable jusqu'au " + expiresAt.slice(0, 10));
    return { token: j.access_token, expiresAt, from: "refresh" };
  } catch (e) {
    // Normal juste après génération : Meta exige qu'un jeton ait plus de 24 h avant de le rafraîchir.
    log("rafraîchissement du jeton non effectué : " + e.message + " — on continue avec le jeton actuel");
    return tk;
  }
}

// Session « porte Instagram » : jeton + compte vérifié. (La porte Facebook est ouverte par facebook.js.)
async function openInstagram(m, log) {
  const tk = await refreshIfNeeded(m, await loadToken(m), log);
  const me = await IG.me(tk.token);
  const expected = String(m.igUserId);
  if (me.id !== expected && me.userId !== expected && me.username !== (m.igUsername || "")) throw new Error(`le jeton appartient au compte @${me.username || "?"} (${me.userId || me.id}), pas au compte attendu ${expected}`);
  return { gate: "instagram", api: IG, token: tk.token, target: me.target, username: me.username, audio: null, label: "porte Instagram, jeton " + tk.from + (tk.expiresAt ? ", valable jusqu'au " + tk.expiresAt.slice(0, 10) : "") };
}

module.exports = Object.assign({}, IG, { graph, call, q, loadToken, refreshIfNeeded, openInstagram, VERSION, BASES });
