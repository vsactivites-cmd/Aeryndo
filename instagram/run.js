#!/usr/bin/env node
// ============================================================
// AERYNDO — robot Instagram (v6)
// Lancé par GitHub Actions toutes les heures à :30 (UTC). Pour chaque marché (content/markets.json),
// regarde l'heure LOCALE du marché ; si on est dans un créneau de publication :
//   1. choisit le contenu (deal vérifié au départ du marché → palmarès → piège → story du dernier post)
//   2. rend les visuels (Playwright) : carrousel 3 × 1080×1350, story 1080×1920, Reel MP4 14 s
//   3. pousse les médias sur la branche `media` du dépôt (URL publiques raw.githubusercontent.com)
//   4. publie sur Instagram (sauf IG_DRY_RUN=1 : tout est préparé, rien n'est publié)
//   5. note le post dans ig-media/state.json (jamais deux fois le même contenu)
// Options :  node run.js                      → créneaux dus maintenant, tous marchés
//            node run.js --slot deal          → force un créneau (marché fr par défaut)
//            node run.js --market fr --slot reel --dry
//            IG_DRY_RUN=1  AERYNDO_SITE=…  MEDIA_BASE=… (URL publique de la branche media)
// ============================================================
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const T = require("./lib/time.js");
const C = require("./lib/content.js");
const R = require("./lib/render.js");
const K = require("./lib/caption.js");
const P = require("./lib/publish.js");

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry") || process.env.IG_DRY_RUN === "1";
const LOCAL = args.includes("--local");   // test sur un ordinateur : pas de git push
const ROOT = path.resolve(__dirname, "..");
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(ROOT, "ig-media");    // worktree de la branche `media`
const MEDIA_BASE = (process.env.MEDIA_BASE || "https://raw.githubusercontent.com/vsactivites-cmd/Aeryndo/media").replace(/\/$/, "");
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function loadState() { const f = path.join(MEDIA_DIR, "state.json"); try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return { posted: [], runs: [] }; } }
function saveState(s) { fs.mkdirSync(MEDIA_DIR, { recursive: true }); fs.writeFileSync(path.join(MEDIA_DIR, "state.json"), JSON.stringify(s, null, 2)); }

async function runOne(m, slot, state) {
  const tag = `[${m.id}/${slot.id}]`;
  if ((state.posted || []).some(p => p.market === m.id && p.slot === slot.id && p.date === slot.date)) { log(tag, "déjà publié aujourd'hui, rien à faire"); return; }
  process.env.AERYNDO_SITE = m.site;
  const c = await C.pick(slot, state, m);
  if (!c) { log(tag, "aucun contenu disponible pour ce créneau (pas de deal au départ de", m.origins.join("/"), ") — on passe"); return; }
  log(tag, "contenu :", c.kind, c.id || c.contentId, c.title ? c.title.fr : c.city ? c.city.fr : "");

  const stamp = slot.date.replace(/-/g, "") + "-" + m.id + "-" + slot.id;
  const outDir = path.join(MEDIA_DIR, "posts", stamp);
  const media = await R.render(slot, c, outDir);
  const caption = slot.kind === "story" ? "" : K.caption(slot, c);
  fs.writeFileSync(path.join(outDir, "caption.txt"), caption);
  const rel = f => MEDIA_BASE + "/" + path.relative(MEDIA_DIR, f).split(path.sep).join("/");
  const urls = media.images ? media.images.map(rel) : { video: rel(media.video), cover: rel(media.cover) };
  log(tag, "visuels :", JSON.stringify(urls));

  // Les médias doivent être en ligne AVANT l'appel Instagram → commit + push de la branche media.
  // En mode brouillon aussi (sauf --local) : c'est là que Valentyna va voir le résultat avant le « go ».
  if (!LOCAL) pushMedia(`Médias ${stamp}`);

  let result = { dry: DRY };
  if (!DRY) {
    let tk = await P.loadToken(m); tk = await P.refreshIfNeeded(m, tk, (...a) => log(tag, ...a));
    if (slot.kind === "carousel") result = await P.publishCarousel(m.igUserId, tk.token, urls, caption);
    else if (slot.kind === "reel") result = await P.publishReel(m.igUserId, tk.token, urls.video, urls.cover, caption);
    else if (slot.kind === "story") result = await P.publishStory(m.igUserId, tk.token, urls[0]);
    result.permalink = await P.permalink(result.id, tk.token);
    log(tag, "publié :", result.permalink || result.id);
  } else log(tag, "MODE BROUILLON — rien n'a été publié sur Instagram");

  const entry = Object.assign({}, c, { slot: slot.id, market: m.id, date: slot.date, contentId: c.id || c.contentId, at: new Date().toISOString(), igId: result.id || null, permalink: result.permalink || null, dry: DRY, dir: path.relative(MEDIA_DIR, outDir) });
  delete entry.posted;
  state.posted = (state.posted || []).concat([entry]).slice(-400);
}

function git(...a) { return execFileSync("git", a, { cwd: MEDIA_DIR, stdio: "pipe" }).toString().trim(); }
function pushMedia(msg) {
  try {
    git("add", "-A");
    try { git("-c", "user.name=aeryndo-robot", "-c", "user.email=robot@aeryndo.co", "commit", "-m", msg); } catch { log("rien à committer"); return; }
    git("push", "origin", "HEAD:media");
    // raw.githubusercontent.com peut mettre quelques secondes à servir un nouveau fichier
    execFileSync("sleep", ["20"]);
  } catch (e) { throw new Error("push de la branche media impossible : " + e.message); }
}

(async () => {
  const state = loadState();
  let jobs;
  if (opt("slot")) { const m = T.market(opt("market")); jobs = [{ market: m, slot: T.slotById(m, opt("slot")) }]; if (!jobs[0].slot) throw new Error("créneau inconnu " + opt("slot")); }
  else jobs = T.dueNow();
  if (!jobs.length) { log("aucun créneau dû maintenant —", T.MARKETS.map(m => m.id + " " + T.localParts(m.tz).hour + "h" + String(T.localParts(m.tz).minute).padStart(2, "0")).join(", ")); return; }
  let failed = 0;
  for (const j of jobs) {
    try { await runOne(j.market, j.slot, state); }
    catch (e) { failed++; log(`[${j.market.id}/${j.slot.id}] ÉCHEC :`, e.message); state.runs = (state.runs || []).concat([{ at: new Date().toISOString(), market: j.market.id, slot: j.slot.id, error: e.message }]).slice(-50); }
  }
  saveState(state);
  if (!LOCAL) { try { pushMedia("État du robot Instagram"); } catch (e) { log(e.message); } }
  if (failed) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
