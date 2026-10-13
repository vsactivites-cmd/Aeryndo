#!/usr/bin/env node
// ============================================================
// AERYNDO — robot Instagram (v7)
// Lancé par GitHub Actions : à l'heure exacte via /api/igtrigger (cron-job.org → workflow_dispatch avec le
// créneau forcé), et toutes les heures en filet de sécurité (cron GitHub, irrégulier). Pour chaque marché
// (content/markets.json) dû maintenant — ou forcé par --slot :
//   0. pré-vol (hors brouillon) : jeton Instagram valide et appartenant bien au compte du marché
//   1. choix du contenu (deal vérifié au départ du marché → palmarès → piège → story du post du jour)
//   2. rendu des visuels (Playwright) : carrousel 3 × 1080×1350, story 1080×1920, Reel MP4 14 s
//   3. push des médias sur la branche `media` (URL publiques raw.githubusercontent.com), sonde HEAD avant Meta
//   4. publication Instagram — SEULEMENT si IG_DRY_RUN vaut exactement "0" (sinon brouillon : rien n'est publié)
//   5. état dans ig-media/state.json : `posted` (publications réelles) et `drafts` (brouillons), séparés.
// Options :  node run.js                       → créneaux dus maintenant, tous marchés
//            node run.js --slot deal           → force un créneau (marché fr par défaut)
//            node run.js --market fr --slot reel --dry --local   (--local : aucun git push, test sur un ordinateur)
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
// Brouillon par défaut : on ne publie que si IG_DRY_RUN vaut exactement "0" (ou --publish) et sans --dry.
const DRY = args.includes("--dry") || !(String(process.env.IG_DRY_RUN || "").trim() === "0" || args.includes("--publish"));
const LOCAL = args.includes("--local");
const ROOT = path.resolve(__dirname, "..");
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(ROOT, "ig-media");    // worktree de la branche `media`
const MEDIA_BASE = (process.env.MEDIA_BASE || "https://raw.githubusercontent.com/vsactivites-cmd/Aeryndo/media").replace(/\/$/, "");
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadState() {
  const f = path.join(MEDIA_DIR, "state.json");
  let s; try { s = JSON.parse(fs.readFileSync(f, "utf8")); } catch { s = {}; }
  s.posted = s.posted || []; s.drafts = s.drafts || []; s.runs = s.runs || [];
  // migration v6 → v7 : les brouillons étaient mélangés aux publications
  const dry = s.posted.filter(p => p.dry); if (dry.length) { s.drafts = s.drafts.concat(dry); s.posted = s.posted.filter(p => !p.dry); }
  return s;
}
function saveState(s) { fs.mkdirSync(MEDIA_DIR, { recursive: true }); fs.writeFileSync(path.join(MEDIA_DIR, "state.json"), JSON.stringify(s, null, 2)); }

// Les médias doivent être joignables par Meta : on sonde chaque URL comme un inconnu (sans jeton) avant d'appeler l'API.
async function waitPublic(urls) {
  for (const u of urls) {
    for (let i = 0; ; i++) {
      const r = await fetch(u, { method: "HEAD", redirect: "follow" }).catch(() => null);
      const ct = (r && r.headers.get("content-type")) || "";
      if (r && r.status === 200 && /image\/jpeg|video\/mp4|octet-stream/.test(ct)) { log("en ligne :", u.split("/").slice(-2).join("/"), ct); break; }
      if (i >= 12) throw new Error("média jamais public (" + (r ? r.status + " " + ct : "réseau") + ") : " + u + " — le dépôt GitHub doit être public");
      await sleep(5000);
    }
  }
}

async function runOne(m, slot, state) {
  const tag = `[${m.id}/${slot.id}]`;
  if (state.posted.some(p => p.market === m.id && p.slot === slot.id && p.date === slot.date)) { log(tag, "déjà publié aujourd'hui, rien à faire"); return; }

  // 0. pré-vol : jeton et compte, AVANT de passer 2 minutes à rendre des visuels
  let tk = null;
  if (!DRY) {
    tk = await P.refreshIfNeeded(m, await P.loadToken(m), (...a) => log(tag, ...a));
    const me = await P.me(tk.token);
    if (String(me.id) !== String(m.igUserId)) throw new Error(`le jeton appartient au compte ${me.username || "?"} (${me.id}), pas à ${m.igUserId}`);
    log(tag, "compte vérifié : @" + me.username + " (jeton " + tk.from + (tk.expiresAt ? ", valable jusqu'au " + tk.expiresAt.slice(0, 10) : "") + ")");
  }

  // 1. contenu
  const c = await C.pick(slot, state, m);
  if (!c) { log(tag, "aucun contenu disponible pour ce créneau (pas de deal au départ de", m.origins.join("/"), ", ou pas de post du jour pour la story) — on passe"); return; }
  log(tag, "contenu :", c.kind, c.id || c.contentId, c.title ? c.title.fr : c.city ? c.city.fr : "");

  // 2. visuels + légende
  const stamp = slot.date.replace(/-/g, "") + "-" + m.id + "-" + slot.id;
  const outDir = path.join(MEDIA_DIR, "posts", stamp);
  const media = await R.render(slot, c, outDir);
  const caption = slot.kind === "story" ? "" : K.caption(slot, c);
  fs.writeFileSync(path.join(outDir, "caption.txt"), caption);
  const rel = f => MEDIA_BASE + "/" + path.relative(MEDIA_DIR, f).split(path.sep).join("/");
  const urls = media.images ? media.images.map(rel) : { video: rel(media.video), cover: rel(media.cover) };
  log(tag, "visuels :", JSON.stringify(urls));

  // 3. médias en ligne (en brouillon aussi, sauf --local : c'est là que Valentyna regarde le résultat)
  if (!LOCAL) { pushMedia(`Médias ${stamp}`); if (!DRY) await waitPublic(media.images ? urls : [urls.video, urls.cover]); }

  // 4. publication
  let result = { dry: DRY };
  if (!DRY) {
    if (slot.kind === "carousel") result = await P.publishCarousel(m.igUserId, tk.token, urls, caption);
    else if (slot.kind === "reel") result = await P.publishReel(m.igUserId, tk.token, urls.video, urls.cover, caption);
    else if (slot.kind === "story") result = await P.publishStory(m.igUserId, tk.token, urls[0]);
    result.permalink = await P.permalink(result.id, tk.token);
    log(tag, "PUBLIÉ :", result.permalink || result.id);
  } else log(tag, "MODE BROUILLON — rien n'a été publié sur Instagram (IG_DRY_RUN=" + JSON.stringify(process.env.IG_DRY_RUN || "") + ")");

  // 5. état
  const entry = Object.assign({}, c, { slot: slot.id, market: m.id, date: slot.date, contentId: c.id || c.contentId, at: new Date().toISOString(), igId: result.id || null, permalink: result.permalink || null, dry: DRY, dir: path.relative(MEDIA_DIR, outDir) });
  if (DRY) state.drafts = state.drafts.concat([entry]).slice(-60);
  else state.posted = state.posted.concat([entry]).slice(-400);
}

function git(...a) { return execFileSync("git", a, { cwd: MEDIA_DIR, stdio: "pipe" }).toString().trim(); }
function pushMedia(msg, tries = 3) {
  git("add", "-A");
  try { git("-c", "user.name=aeryndo-robot", "-c", "user.email=robot@aeryndo.co", "commit", "-m", msg); } catch { log("rien à committer"); return; }
  for (let i = 1; ; i++) {
    try { git("push", "origin", "HEAD:media"); return; }
    catch (e) {
      if (i >= tries) throw new Error("push de la branche media impossible : " + e.message);
      try { git("-c", "user.name=aeryndo-robot", "-c", "user.email=robot@aeryndo.co", "pull", "--rebase", "origin", "media"); } catch { }
    }
  }
}

(async () => {
  const state = loadState();
  let jobs;
  if (opt("slot")) { const m = T.market(opt("market")); jobs = [{ market: m, slot: T.slotById(m, opt("slot")) }]; if (!jobs[0].slot) throw new Error("créneau inconnu " + opt("slot")); }
  else jobs = T.dueNow();
  log(DRY ? "mode BROUILLON" : "mode PUBLICATION", "—", jobs.length ? jobs.map(j => j.market.id + "/" + j.slot.id).join(", ") : "aucun créneau dû maintenant (" + T.MARKETS.map(m => m.id + " " + T.localParts(m.tz).hour + "h" + String(T.localParts(m.tz).minute).padStart(2, "0")).join(", ") + ")");
  if (!jobs.length) return;
  let failed = 0;
  for (const j of jobs) {
    try { await runOne(j.market, j.slot, state); }
    catch (e) { failed++; log(`[${j.market.id}/${j.slot.id}] ÉCHEC :`, e.message); state.runs = state.runs.concat([{ at: new Date().toISOString(), market: j.market.id, slot: j.slot.id, dry: DRY, error: e.message }]).slice(-50); }
  }
  saveState(state);
  // L'état DOIT être poussé : sans lui, le passage suivant republierait le même post. Échec = job rouge.
  if (!LOCAL) pushMedia("État du robot Instagram");
  if (failed) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
