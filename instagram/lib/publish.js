// Publication via l'API Instagram (Instagram Login) — graph.instagram.com, v21.0.
//   carrousel : 1 conteneur par image (is_carousel_item) → conteneur CAROUSEL → media_publish
//   reel      : conteneur REELS (video_url + cover_url) → attendre FINISHED → media_publish
//   story     : conteneur STORIES (image_url) → media_publish
// Les médias doivent être des URL publiques (branche `media` du dépôt GitHub, servie par raw.githubusercontent.com).
// Jeton : lu dans l'env (secret GitHub) ; s'il reste < 15 jours, on le rafraîchit et on dépose le nouveau
// sur https://www.aeryndo.co/api/igtoken (protégé par CRON_SECRET) — le robot le relit à chaque run,
// de sorte que le secret GitHub n'a jamais besoin d'être ressaisi.
const G = "https://graph.instagram.com/v21.0";

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok || j.error) throw new Error("Instagram " + r.status + " " + (j.error ? j.error.message + " (code " + j.error.code + (j.error.error_subcode ? "/" + j.error.error_subcode : "") + ")" : txt.slice(0, 300)));
  return j;
}
const q = o => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitReady(id, token, maxMs) {
  const t0 = Date.now();
  for (;;) {
    const s = await call("GET", `${G}/${id}?${q({ fields: "status_code,status", access_token: token })}`);
    if (s.status_code === "FINISHED") return s;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("conteneur " + id + " en erreur : " + (s.status || s.status_code));
    if (Date.now() - t0 > (maxMs || 10 * 60000)) throw new Error("conteneur " + id + " toujours pas prêt (" + s.status_code + ")");
    await sleep(8000);
  }
}

async function publishCarousel(ig, token, imageUrls, caption) {
  const children = [];
  for (const u of imageUrls) {
    const c = await call("POST", `${G}/${ig}/media`, { image_url: u, is_carousel_item: true, access_token: token });
    children.push(c.id);
  }
  for (const id of children) await waitReady(id, token, 3 * 60000);
  const parent = await call("POST", `${G}/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, access_token: token });
  await waitReady(parent.id, token, 3 * 60000);
  return call("POST", `${G}/${ig}/media_publish`, { creation_id: parent.id, access_token: token });
}
async function publishReel(ig, token, videoUrl, coverUrl, caption) {
  const c = await call("POST", `${G}/${ig}/media`, { media_type: "REELS", video_url: videoUrl, cover_url: coverUrl, caption, share_to_feed: true, access_token: token });
  await waitReady(c.id, token, 12 * 60000);
  return call("POST", `${G}/${ig}/media_publish`, { creation_id: c.id, access_token: token });
}
async function publishStory(ig, token, imageUrl) {
  const c = await call("POST", `${G}/${ig}/media`, { media_type: "STORIES", image_url: imageUrl, access_token: token });
  await waitReady(c.id, token, 3 * 60000);
  return call("POST", `${G}/${ig}/media_publish`, { creation_id: c.id, access_token: token });
}
async function permalink(mediaId, token) { try { const j = await call("GET", `${G}/${mediaId}?${q({ fields: "permalink", access_token: token })}`); return j.permalink; } catch { return null; } }

// ---------- jeton : lecture (Vercel d'abord, secret GitHub sinon) et rafraîchissement ----------
async function loadToken(m) {
  const site = m.site, key = process.env.CRON_SECRET;
  if (key) {
    try {
      const r = await fetch(`${site}/api/igtoken?key=${encodeURIComponent(key)}&market=${m.id}`);
      if (r.ok) { const j = await r.json(); if (j.token) return { token: j.token, expiresAt: j.expiresAt || null, from: "vercel" }; }
    } catch { }
  }
  const t = process.env[m.tokenEnv || "IG_ACCESS_TOKEN"];
  if (!t) throw new Error("aucun jeton Instagram pour le marché " + m.id);
  return { token: t.trim(), expiresAt: null, from: "env" };
}
async function refreshIfNeeded(m, tk, log) {
  const daysLeft = tk.expiresAt ? (Date.parse(tk.expiresAt) - Date.now()) / 86400000 : null;
  if (daysLeft != null && daysLeft > 15) return tk;
  if (daysLeft == null && tk.from === "vercel") return tk;
  try {
    const j = await call("GET", `${G}/refresh_access_token?${q({ grant_type: "ig_refresh_token", access_token: tk.token })}`);
    const expiresAt = new Date(Date.now() + (j.expires_in || 5184000) * 1000).toISOString();
    if (process.env.CRON_SECRET) {
      await fetch(`${m.site}/api/igtoken?key=${encodeURIComponent(process.env.CRON_SECRET)}&market=${m.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: j.access_token, expiresAt }) });
    }
    log("jeton rafraîchi, valable jusqu'au " + expiresAt.slice(0, 10));
    return { token: j.access_token, expiresAt, from: "refresh" };
  } catch (e) { log("rafraîchissement du jeton impossible : " + e.message); return tk; }
}

async function me(token) { return call("GET", `${G}/me?${q({ fields: "id,username,followers_count,media_count", access_token: token })}`); }

module.exports = { publishCarousel, publishReel, publishStory, permalink, loadToken, refreshIfNeeded, me, waitReady };
