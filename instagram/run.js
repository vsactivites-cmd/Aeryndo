#!/usr/bin/env node
// ============================================================
// AERYNDO — robot Instagram (v8)
// Lancé par GitHub Actions : à l'heure exacte via /api/igtrigger (cron-job.org → workflow_dispatch avec le
// créneau forcé), et toutes les heures en filet de sécurité (cron GitHub, irrégulier). Pour chaque marché
// (content/markets.json) dû maintenant — ou forcé par --slot :
//   0. pré-vol (hors brouillon) : porte Facebook (jeton de Page permanent + musique des Reels, v8) si elle est
//      configurée, sinon porte Instagram historique ; dans les deux cas le compte est vérifié avant tout rendu
//   1. choix du contenu (deal vérifié au départ du marché → palmarès → piège → story du post du jour)
//   2. rendu des visuels (Playwright) : carrousel 3 × 1080×1350, story 1080×1920, Reel MP4 14 s — avec la musique
//      originale Aeryndo composée par lib/music.js (v9.2) : le Reel n'est jamais muet, même sans porte Facebook
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
const FB = require("./lib/facebook.js");
const MUSIC = require("./lib/music.js");

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
// Brouillon par défaut : on ne publie que si IG_DRY_RUN vaut exactement "0" (ou --publish) et sans --dry.
const DRY = args.includes("--dry") || !(String(process.env.IG_DRY_RUN || "").trim() === "0" || args.includes("--publish"));
const LOCAL = args.includes("--local");
const FB_ONLY = args.includes("--fb-only");
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

// v10 : créneau « email » — le robot déclenche le digest du vendredi (« le deal + le refusé ») sur le site,
// qui l'envoie à toute la liste Brevo. Pas de visuel, pas d'Instagram ; la clé n'apparaît jamais dans les journaux.
async function runEmail(m, slot, state) {
  const tag = `[${m.id}/${slot.id}]`;
  const key = process.env.CRON_SECRET; if (!key) throw new Error("CRON_SECRET manquant : digest non déclenché");
  const r = await fetch(`${m.site}/api/subscribe?digest=1&key=${encodeURIComponent(key)}${DRY ? "&dry=1" : ""}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error("digest : HTTP " + r.status + " " + JSON.stringify(j).slice(0, 300));
  log(tag, DRY ? "MODE BROUILLON — digest simulé :" : "digest envoyé :", JSON.stringify(j));
  const entry = { kind: "email", slot: slot.id, market: m.id, date: slot.date, contentId: "digest-" + slot.date, at: new Date().toISOString(), dry: DRY, stats: j };
  if (DRY) state.drafts = state.drafts.concat([entry]).slice(-60);
  else state.posted = state.posted.concat([entry]).slice(-400);
}

// --fb-only : ne touche pas à Instagram ; reprend le dernier post publié de ce créneau (médias déjà en ligne sur la
// branche media) et le publie sur la Page Facebook. Sert au rattrapage (premier miroir du 26 nov.) et aux tests.
async function runFacebookOnly(m, slot, state) {
  const tag = `[${m.id}/${slot.id}/facebook]`;
  const entry = state.posted.slice().reverse().find(p => p.market === m.id && p.slot === slot.id && !p.dry && p.dir);
  if (!entry) throw new Error("aucun post publié trouvé pour ce créneau");
  if (entry.facebook) { log(tag, "déjà sur Facebook :", entry.facebook.url); return; }
  const dir = path.join(MEDIA_DIR, entry.dir);
  const rel = f => MEDIA_BASE + "/" + path.relative(MEDIA_DIR, f).split(path.sep).join("/");
  const files = fs.readdirSync(dir);
  const images = files.filter(f => /^slide-\d+\.jpg$/.test(f) || /^story-1\.jpg$/.test(f)).sort().map(f => rel(path.join(dir, f)));
  const video = files.find(f => /\.mp4$/.test(f));
  const urls = slot.kind === "reel" ? { video: rel(path.join(dir, video)), cover: rel(path.join(dir, "cover-1.jpg")) } : images;
  const caption = fs.existsSync(path.join(dir, "caption.txt")) ? fs.readFileSync(path.join(dir, "caption.txt"), "utf8") : K.caption(slot, entry);
  log(tag, "post Instagram du", entry.date, "→ Facebook :", JSON.stringify(urls));
  if (DRY) { log(tag, "MODE BROUILLON — texte Facebook :", JSON.stringify(FB.pageText(caption, entry, slot).slice(0, 200)) + "…"); return; }
  const fb = await FB.mirror(m, slot, entry, urls, caption, (...a) => log(tag, ...a));
  entry.facebook = fb; log(tag, "Facebook :", fb.url);
}

async function runOne(m, slot, state) {
  const tag = `[${m.id}/${slot.id}]`;
  if (FB_ONLY) return runFacebookOnly(m, slot, state);
  if (state.posted.some(p => p.market === m.id && p.slot === slot.id && p.date === slot.date)) { log(tag, "déjà publié aujourd'hui, rien à faire"); return; }
  if (slot.kind === "email") return runEmail(m, slot, state);

  // 0. pré-vol : porte, jeton et compte, AVANT de passer 2 minutes à rendre des visuels
  let session = null;
  if (!DRY) {
    const say = (...a) => log(tag, ...a);
    try { session = await FB.open(m, say); }
    catch (e) { say("porte Facebook indisponible (" + e.message + ") — repli sur la porte Instagram"); }
    if (!session) session = await P.openInstagram(m, say);
    log(tag, "compte vérifié : @" + session.username + " (" + session.target + ", " + session.label + ")");
    if (slot.kind === "reel") {
      const want = FB.wanted(m);
      if (session.gate === "facebook") session.audios = await FB.findAudio(session, say);
      else say("porte Instagram : la musique originale Aeryndo est intégrée dans la vidéo (v9.2)");
      if (session.catalogue) state.audioCatalogue = { at: new Date().toISOString(), market: m.id, wanted: want.tracks.map(t => t.title), ready: (session.audios || []).map(a => a.title), searches: session.catalogue };
      if (want.required && want.tracks.length && !(session.audios && session.audios.length)) throw new Error("aucune des musiques demandées n'est disponible (" + want.tracks.map(t => t.title).join(", ") + ") — Reel NON publié (reelAudio.required)");
    }
  }

  // 1. contenu
  const c = await C.pick(slot, state, m);
  if (!c) { log(tag, "aucun contenu disponible pour ce créneau (pas de deal au départ de", m.origins.join("/"), ", ou pas de post du jour pour la story) — on passe"); return; }
  log(tag, "contenu :", c.kind, c.id || c.contentId, c.title ? c.title.fr : c.city ? c.city.fr : "", c.rotation ? "(rotation du palmarès : tout a déjà été posté depuis moins de 60 jours)" : "");

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
    const A = session.api, tk = session.token, igTarget = session.target;
    if (slot.kind === "carousel") result = await A.publishCarousel(igTarget, tk, urls, caption);
    else if (slot.kind === "reel") result = await A.publishReel(igTarget, tk, urls.video, urls.cover, caption, session.audios, (...a) => log(tag, ...a), { required: FB.wanted(m).required, audioName: MUSIC.TITLE });
    else if (slot.kind === "story") result = await A.publishStory(igTarget, tk, urls[0]);
    result.permalink = await A.permalink(result.id, tk);
    log(tag, "PUBLIÉ :", result.permalink || result.id, result.audio ? "— musique : " + result.audio.title : (slot.kind === "reel" ? "— sans musique" : ""));
    // v10-fb : miroir sur la Page Facebook (jamais bloquant)
    if (m.facebookPage) {
      try { const fb = await FB.mirror(m, slot, c, urls, caption, (...a) => log(tag, ...a)); result.facebook = fb; log(tag, "Facebook :", fb.url); }
      catch (e) { result.facebookError = String(e.message || e); log(tag, "Facebook (miroir) ÉCHEC :", result.facebookError); }
    }
  } else {
    log(tag, "MODE BROUILLON — rien n'a été publié sur Instagram (IG_DRY_RUN=" + JSON.stringify(process.env.IG_DRY_RUN || "") + ")");
    if (m.facebookPage && slot.kind !== "story") log(tag, "MODE BROUILLON — texte Facebook :", JSON.stringify(FB.pageText(caption, c, slot).slice(0, 160)) + "…");
  }

  // 5. état
  const entry = Object.assign({}, c, { slot: slot.id, market: m.id, date: slot.date, contentId: c.id || c.contentId, at: new Date().toISOString(), igId: result.id || null, permalink: result.permalink || null, dry: DRY, gate: session ? session.gate : null, audio: result.audio || null, audioError: result.audioError || null, facebook: result.facebook || null, facebookError: result.facebookError || null, dir: path.relative(MEDIA_DIR, outDir) });
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
