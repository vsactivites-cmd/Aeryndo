// Porte Facebook (v8) : publication via graph.facebook.com avec le jeton de la Page reliée au compte Instagram,
// et musique du catalogue Instagram sur les Reels (Audio API — disponible uniquement par cette porte).
//
// Ce qu'il faut : le secret GitHub FB_USER_TOKEN (jeton utilisateur « longue durée », 60 jours, généré une fois dans
// l'Explorateur de l'API Graph + débogueur « Étendre »). Avec lui, le robot obtient LUI-MÊME le jeton de la Page
// (qui n'expire pas), vérifie que la Page est bien reliée au compte attendu, et dépose le tout sur Vercel
// (/api/igtoken?kind=fb). Les passages suivants n'utilisent plus que ce jeton de Page : FB_USER_TOKEN peut expirer.
// Si quoi que ce soit échoue ici, run.js retombe sur la porte Instagram historique (publication sans musique).
const P = require("./publish.js");

const api = P.graph("facebook");
const q = P.q;
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// ---------- coffre Vercel (clé ig:token:<marché>:fb) ----------
async function loadStore(m) {
  const key = process.env.CRON_SECRET; if (!key) return null;
  try {
    const r = await fetch(`${m.site}/api/igtoken?key=${encodeURIComponent(key)}&market=${m.id}&kind=fb`);
    if (!r.ok) return null;
    const j = await r.json(); return j && j.ok && j.pageToken ? j : null;
  } catch { return null; }
}
async function saveStore(m, st) {
  const key = process.env.CRON_SECRET; if (!key) return false;
  const body = { pageToken: st.pageToken, pageId: st.pageId, pageName: st.pageName, igUserId: st.igUserId, discoveredAt: st.discoveredAt, audio: st.audio || null };
  const r = await fetch(`${m.site}/api/igtoken?key=${encodeURIComponent(key)}&market=${m.id}&kind=fb`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("dépôt du jeton de Page sur Vercel refusé : HTTP " + r.status);
  return true;
}

// ---------- la Page reliée au compte Instagram du marché → son jeton (permanent) ----------
async function discoverPage(userToken, igUserId) {
  const j = await api.call("GET", `${api.G}/me/accounts?${q({ fields: "id,name,access_token,instagram_business_account", limit: 100, access_token: userToken })}`);
  const pages = j.data || [];
  const hit = pages.find(p => p.instagram_business_account && String(p.instagram_business_account.id) === String(igUserId));
  if (!hit) throw new Error("aucune Page Facebook reliée au compte Instagram " + igUserId + " — Pages vues : " + (pages.length ? pages.map(p => "« " + p.name + " »" + (p.instagram_business_account ? " (Instagram " + p.instagram_business_account.id + ")" : " (sans Instagram relié)")).join(", ") : "aucune"));
  if (!hit.access_token) throw new Error("la Page « " + hit.name + " » ne renvoie pas de jeton (autorisation pages_show_list / business_management manquante ?)");
  return { pageId: String(hit.id), pageName: hit.name, pageToken: hit.access_token };
}

async function preflight(st, m) {
  const me = await api.call("GET", `${api.G}/${m.igUserId}?${q({ fields: "id,username", access_token: st.pageToken })}`);
  if (m.igUsername && me.username !== m.igUsername) throw new Error("la Page « " + st.pageName + " » est reliée à @" + me.username + ", pas à @" + m.igUsername);
  return me;
}

// Ouvre la session Facebook pour un marché, ou renvoie null si elle n'est pas configurée (pas de FB_USER_TOKEN ni de jeton déposé).
async function open(m, log) {
  const userToken = (process.env[m.fbTokenEnv || "FB_USER_TOKEN"] || "").trim();
  let st = await loadStore(m);
  if (!st && !userToken) return null;
  const discover = async () => {
    if (!userToken) throw new Error("jeton de Page invalide et aucun FB_USER_TOKEN pour en obtenir un nouveau");
    const d = await discoverPage(userToken, m.igUserId);
    const next = Object.assign({}, st || {}, d, { igUserId: String(m.igUserId), discoveredAt: new Date().toISOString() });
    await saveStore(m, next);
    log("jeton de la Page « " + d.pageName + " » obtenu et déposé sur Vercel (permanent)");
    return next;
  };
  if (!st) st = await discover();
  let me;
  try { me = await preflight(st, m); }
  catch (e) {
    if (!userToken) throw e;
    log("jeton de Page refusé (" + e.message + ") — on en redemande un");
    st = await discover(); me = await preflight(st, m);
  }
  return { gate: "facebook", api, token: st.pageToken, target: String(m.igUserId), username: me.username, userToken, store: st, m, label: "porte Facebook, Page « " + st.pageName + " », jeton permanent" };
}

// ---------- musique du Reel : catalogue Instagram (titres autorisés pour les apps tierces) ----------
async function findAudio(session, log) {
  const m = session.m, want = m.reelAudio;
  if (!want || (!want.title && !want.id)) return null;
  if (want.id) return { id: String(want.id), title: want.title || null, artist: want.artist || null, volume: want.volume, videoVolume: want.videoVolume };
  const cached = session.store.audio;
  if (cached && cached.id && norm(cached.wantTitle) === norm(want.title) && Date.now() - Date.parse(cached.at || 0) < 90 * 86400000) {
    return Object.assign({}, cached, { volume: want.volume, videoVolume: want.videoVolume });
  }
  const tokens = [session.token, session.userToken].filter(Boolean);
  let lastErr = null;
  for (const tk of tokens) {
    try {
      const j = await api.call("GET", `${api.G}/ig_audio?${q({ audio_type: "music", search_query: want.title, user_id: session.target, access_token: tk })}`);
      const list = j.audio || j.data || [];
      log("catalogue (" + list.length + ") : " + (list.slice(0, 8).map(a => a.title + " — " + (a.display_artist || "?") + " [" + (a.audio_id || a.id) + "]").join(" · ") || "rien"));
      const byBoth = list.find(a => norm(a.title).includes(norm(want.title)) && (!want.artist || norm(a.display_artist).includes(norm(want.artist))));
      const hit = byBoth || (want.artist ? null : list.find(a => norm(a.title).includes(norm(want.title))));
      if (!hit) { log("« " + want.title + (want.artist ? " » de " + want.artist : " »") + " n'est pas dans le catalogue autorisé — Reel publié sans musique"); return null; }
      const audio = { id: String(hit.audio_id || hit.id), title: hit.title, artist: hit.display_artist || null, durationMs: hit.duration_in_ms || null, wantTitle: want.title, at: new Date().toISOString() };
      session.store.audio = audio;
      try { await saveStore(m, session.store); } catch (e) { log("mémorisation de la musique impossible : " + e.message); }
      log("musique : « " + audio.title + " » — " + audio.artist + " (" + audio.id + ")");
      return Object.assign({}, audio, { volume: want.volume, videoVolume: want.videoVolume });
    } catch (e) { lastErr = e; }
  }
  log("recherche de musique impossible (" + (lastErr && lastErr.message) + ") — Reel publié sans musique");
  return null;
}

module.exports = { open, findAudio, discoverPage, api };
