// ============================================================
// AERYNDO — mémoire du robot (clés/valeurs JSON)
//
// Deux modes, choisis automatiquement :
//   1. Upstash Redis via son API REST (gratuit) — variables Vercel :
//      UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//      (ou KV_REST_API_URL + KV_REST_API_TOKEN si le store a été créé
//      depuis la Marketplace Vercel « Upstash for Redis »).
//   2. Repli en mémoire du processus : tout fonctionne, mais rien ne
//      survit d'une exécution à l'autre (pas d'historique de prix).
// Zéro dépendance npm : fetch natif.
// ============================================================

const URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const PERSISTENT = Boolean(URL && TOKEN);
const PREFIX = "aeryndo:";

const mem = new Map();

async function redis(cmd) {
  const resp = await fetch(URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  if (!resp.ok) throw new Error("store HTTP " + resp.status);
  const json = await resp.json();
  if (json && json.error) throw new Error("store: " + json.error);
  return json ? json.result : null;
}

async function get(key) {
  if (!PERSISTENT) { const v = mem.get(PREFIX + key); return v === undefined ? null : v; }
  const raw = await redis(["GET", PREFIX + key]);
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function set(key, value, ttlSeconds) {
  if (!PERSISTENT) { mem.set(PREFIX + key, value); return true; }
  const cmd = ["SET", PREFIX + key, JSON.stringify(value)];
  if (ttlSeconds) cmd.push("EX", String(ttlSeconds));
  await redis(cmd);
  return true;
}

// Verrou : vrai si obtenu. Empêche deux balayages simultanés (GitHub Actions + visite).
async function lock(key, ttlSeconds) {
  if (!PERSISTENT) {
    const k = PREFIX + key, until = mem.get(k);
    if (until && until > Date.now()) return false;
    mem.set(k, Date.now() + ttlSeconds * 1000);
    return true;
  }
  const r = await redis(["SET", PREFIX + key, String(Date.now()), "NX", "EX", String(ttlSeconds)]);
  return r === "OK";
}

async function del(key) {
  if (!PERSISTENT) { mem.delete(PREFIX + key); return; }
  await redis(["DEL", PREFIX + key]);
}

module.exports = { get, set, lock, del, PERSISTENT };
