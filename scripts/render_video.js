'use strict';
/*
 * render_video.js — turns a cue list into a finished 1080x1920 video.
 *
 * The three rules that shape everything here:
 *   1. A subtitle is on screen ONLY while the narrator is actually saying that
 *      line. Silence means a clean frame, never a caption sitting there early.
 *   2. Every subtitle is a single line. The generator guarantees 4 to 6 words,
 *      and this file refuses to render anything that slipped through.
 *   3. The clip cuts at exactly the moment the subtitle changes.
 *
 * Usage: node scripts/render_video.js <content.json>
 *
 * content.json:
 * {
 *   "outDir": "...",
 *   "cues": [ { "he": "...", "en": "...", "query": "stock search" }, ... ],
 *   "musicFile": "/path/to/bed.mp3",
 *   "brand": "@adhdfocus_flow"          // optional, omit for no watermark
 * }
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const { lineIsLegal, countWords, stripEmoji } = require('./lib/copy_rules.js');
const { speak } = require('./tts.js');

const ROOT = path.join(__dirname, '..');
const W = 1080, H = 1920, FPS = 30;

// How long a caption lingers after the last word of its line. Small enough that
// it still reads as "only while speaking", big enough that it does not flicker.
const CAPTION_TAIL = 0.18;

// ----------------------------------------------------------- binaries ------

function findBin(name) {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && name === 'ffmpeg' && fs.existsSync(envPath)) return envPath;
  if (envPath && name === 'ffprobe') {
    const guess = envPath.replace(/ffmpeg(\.exe)?$/i, (m) => (m.toLowerCase().endsWith('.exe') ? 'ffprobe.exe' : 'ffprobe'));
    if (fs.existsSync(guess)) return guess;
  }
  try { execFileSync(name, ['-version'], { stdio: 'ignore' }); return name; } catch (e) {}
  const roots = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft/WinGet/Packages') : null,
    'C:/Program Files', 'C:/ffmpeg',
  ].filter(Boolean);
  for (const r of roots) {
    let found = null;
    (function walk(d, depth) {
      if (found || depth > 5 || !fs.existsSync(d)) return;
      let entries;
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of entries) {
        if (found) return;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, depth + 1);
        else if (e.name.toLowerCase() === name + '.exe') found = p;
      }
    })(r, 0);
    if (found) return found;
  }
  throw new Error(`Could not find ${name}. Install ffmpeg and put it on PATH.`);
}

// ----------------------------------------------------------------- http ----

function fetchOnce(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const req = https.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchOnce(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        const err = new Error(`HTTP ${res.statusCode}`);
        // Pixabay allows 100 requests per 60 seconds and says when the window
        // resets. Backing off a couple of seconds against a 60 second window
        // just burns the remaining retries, so carry the real number through.
        const reset = Number(res.headers['x-ratelimit-reset'] || res.headers['retry-after']);
        if (Number.isFinite(reset) && reset > 0) err.retryAfterMs = Math.min(reset, 120) * 1000;
        return reject(err);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

/*
 * A single DNS blip took down a whole run once, in the middle of the second of
 * two renders, after the first had already been scheduled. Network calls in a
 * job this long have to assume the network will hiccup.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Some socket and spawn failures arrive with an empty .message, which turns a
// log line into "failed: " and tells you nothing. Always say something.
function describe(e) {
  if (!e) return 'unknown error';
  return e.message || e.code || e.errno || String(e) || 'unknown error';
}

/*
 * Pace requests to Pixabay instead of sprinting into its 100-per-minute wall.
 * Waiting out a 429 costs ten seconds; spacing calls costs well under one, and
 * a run that hit the limit on nearly every clip spent more time sleeping than
 * rendering.
 */
let nextSlotAt = 0;
async function pace(url) {
  if (!/pixabay\.com/.test(url)) return;
  const gap = 700;
  const now = Date.now();
  const wait = Math.max(0, nextSlotAt - now);
  nextSlotAt = Math.max(now, nextSlotAt) + gap;
  if (wait) await sleep(wait);
}

async function getBuf(url, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    await pace(url);
    try {
      return await fetchOnce(url);
    } catch (e) {
      last = e;
      const transient = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|EPIPE|socket hang up|timed out|HTTP 5\d\d|HTTP 429/.test(describe(e));
      if (!transient || i === attempts - 1) break;
      // Honour the server's own reset window when it gives one, otherwise back
      // off exponentially. A 429 with no header still waits out a full minute,
      // because that is the length of Pixabay's window.
      const wait = e.retryAfterMs || (/HTTP 429/.test(describe(e)) ? 65000 : 1500 * Math.pow(2, i));
      console.warn(`  ${describe(e)}, waiting ${Math.round(wait / 1000)}s before retry ${i + 2}/${attempts}`);
      await sleep(wait);
    }
  }
  throw last;
}

// ------------------------------------------------------------------ font ---

/*
 * libass needs a real font file with Hebrew glyphs. Windows has Arial, Ubuntu
 * runners do not, so fall back to downloading Noto Sans Hebrew once and caching
 * it in the repo's assets folder.
 */
const FONT_URL = 'https://raw.githubusercontent.com/notofonts/hebrew/main/fonts/NotoSansHebrew/hinted/ttf/NotoSansHebrew-Bold.ttf';

async function ensureFont() {
  const dir = path.join(ROOT, 'assets', 'fonts');
  fs.mkdirSync(dir, { recursive: true });

  const cached = fs.readdirSync(dir).filter((f) => /\.ttf$/i.test(f));
  if (cached.length) {
    const file = path.join(dir, cached[0]);
    return { file, family: /noto/i.test(cached[0]) ? 'Noto Sans Hebrew' : 'Arial' };
  }

  const win = 'C:/Windows/Fonts/arialbd.ttf';
  if (process.platform === 'win32' && fs.existsSync(win)) {
    return { file: win, family: 'Arial' };
  }

  for (const p of [
    '/usr/share/fonts/truetype/noto/NotoSansHebrew-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ]) {
    if (fs.existsSync(p)) {
      return { file: p, family: /noto/i.test(p) ? 'Noto Sans Hebrew' : 'DejaVu Sans' };
    }
  }

  console.log('  fetching Hebrew font (one time)...');
  const dest = path.join(dir, 'NotoSansHebrew-Bold.ttf');
  fs.writeFileSync(dest, await getBuf(FONT_URL));
  return { file: dest, family: 'Noto Sans Hebrew' };
}

// ----------------------------------------------------------------- emoji ---

/*
 * libass renders emoji as blank or monochrome boxes, so the pointing hand is
 * stripped from the burned text and composited back in as a real colour image.
 * Twemoji is CC BY 4.0, which is fine for commercial use with the credit that
 * already sits in the repo.
 */
const EMOJI_URL = 'https://raw.githubusercontent.com/jdecked/twemoji/main/assets/72x72/1f447.png';

async function ensureEmoji() {
  const dir = path.join(ROOT, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'emoji_point_down.png');
  if (!fs.existsSync(dest)) {
    try {
      fs.writeFileSync(dest, await getBuf(EMOJI_URL));
    } catch (e) {
      console.warn(`  could not fetch the pointing emoji (${e.message}) — rendering without it`);
      return null;
    }
  }
  return dest;
}

// Narration now lives in tts.js — Hebrew, per line, through ElevenLabs.

// ------------------------------------------------------------------ util ---

function tc(sec) {
  if (!(sec > 0)) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/*
 * Wrap each line in RTL marks so libass puts commas and periods on the correct
 * side, and turn real newlines into ASS line breaks.
 *
 * The line-by-line split matters: stripEmoji collapses all whitespace, so
 * handing it a multi-line card whole would flatten the card into one long
 * line. The end card is the only place with deliberate line breaks, and it
 * silently lost them.
 */
function rtl(text) {
  return String(text || '')
    .split('\n')
    .map((line) => '\u202b' + stripEmoji(line) + '\u202c')
    .join('\\N');
}

// --------------------------------------------------------------- renderer --

async function render(C) {
  const OUT_DIR = C.outDir;
  if (!OUT_DIR) throw new Error('content needs "outDir"');
  const cues = C.cues;
  if (!Array.isArray(cues) || !cues.length) throw new Error('content needs a non empty "cues" array');

  // Rule 2, enforced at the last possible moment. Cues flagged `card` are the
  // closing call to action, which the founder specified line by line and which
  // ends on a deliberate one word line.
  const illegal = cues
    .map((c, i) => ({ i, he: c.he, n: countWords(c.he), ok: c.card || lineIsLegal(c.he) }))
    .filter((x) => !x.ok);
  if (illegal.length) {
    throw new Error('subtitle rule broken:\n' + illegal.map((x) => `  cue ${x.i}: "${x.he}" (${x.n} words)`).join('\n'));
  }

  const FFMPEG = findBin('ffmpeg');
  const FFPROBE = findBin('ffprobe');

  /*
   * Capture stderr rather than inheriting it. With stdio 'inherit' a failing
   * ffmpeg throws an Error with an EMPTY message, which is how a real failure
   * once surfaced as the useless line "cut failed: " with nothing after it.
   */
  const ff = (args, cwd) => {
    try {
      return execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args],
        { cwd, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    } catch (e) {
      const detail = (e.stderr && e.stderr.toString().trim()) || e.message || String(e.code || e);
      throw new Error(`ffmpeg failed (exit ${e.status}): ${detail.split('\n').slice(-4).join(' | ')}`);
    }
  };
  const probeDur = (f) => parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

  const WORK = path.join(OUT_DIR, '.work');
  fs.mkdirSync(WORK, { recursive: true });

  const PIXABAY_KEY = process.env.PIXABAY_KEY;
  const needsStock = cues.some((c) => !c.clipFile);
  if (needsStock && !PIXABAY_KEY) throw new Error('PIXABAY_KEY is missing. Put it in .env');

  /*
   * 1) Narrate. Hebrew, one line at a time, through ElevenLabs.
   *
   * Speaking each line separately is what makes the first rule exact rather
   * than approximate: a line's audio IS its subtitle window, so a caption
   * physically cannot appear before the narrator reaches it. It is also what
   * makes the bill small, because every line is cached by its text and the
   * closing card is therefore paid for once in its life.
   */
  const GAP = 0.3; // a breath between lines
  console.log('  narrating...');
  let clock = 0;
  let spent = 0;
  let reused = 0;
  const pieces = [];
  for (const c of cues) {
    // strip the emoji so the narrator does not try to pronounce it
    const spoken = stripEmoji(c.he);
    const r = await speak(spoken, { ffprobe: FFPROBE });
    c.speakStart = clock;
    c.speakEnd = clock + r.duration;
    clock = c.speakEnd + GAP;
    pieces.push(r.file);
    spent += r.characters;
    if (r.cached) reused++;
  }
  const voiceDur = clock - GAP;
  console.log(`  ${cues.length} lines · ${reused} reused from cache · ${spent} characters billed`);

  // stitch the lines into one track, with the gap between them
  const silence = path.join(WORK, 'gap.wav');
  ff(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', String(GAP), silence]);
  const listLines2 = [];
  pieces.forEach((p, i) => {
    const wav = path.join(WORK, `v${String(i).padStart(3, '0')}.wav`);
    ff(['-i', p, '-ar', '44100', '-ac', '1', wav]);
    listLines2.push(`file '${path.basename(wav)}'`);
    if (i < pieces.length - 1) listLines2.push(`file '${path.basename(silence)}'`);
  });
  fs.writeFileSync(path.join(WORK, 'vlist.txt'), listLines2.join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', 'vlist.txt', '-c', 'copy', 'voice.wav'], WORK);

  const TOTAL = C.totalSeconds || Math.round((voiceDur + 1.6) * 100) / 100;

  // 3) Rule 3 — the picture cuts where the caption cuts. Clips are contiguous
  //    (there can be no hole in a video track) and start on the caption's word.
  cues.forEach((c, i) => {
    c.clipStart = i === 0 ? 0 : c.speakStart;
    c.clipEnd = i < cues.length - 1 ? cues[i + 1].speakStart : TOTAL;
  });

  console.log(`  voice ${voiceDur.toFixed(1)}s · video ${TOTAL.toFixed(1)}s · ${cues.length} cues`);

  // 4) stock footage.
  //
  // Pixabay allows 100 API calls a minute, and a single slot renders two cuts
  // that share all but the last two lines. Without a cache that is double the
  // searches and double the downloads for identical footage, which is exactly
  // how the first live runs walked into HTTP 429. Searches and clip files are
  // therefore cached on disk and survive across cuts, slots and reruns.
  const CACHE = path.join(ROOT, '.cache');
  const SEARCH_DIR = path.join(CACHE, 'search');
  const CLIP_DIR = path.join(CACHE, 'clips');
  fs.mkdirSync(SEARCH_DIR, { recursive: true });
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  const SEARCH_TTL = 7 * 24 * 3600 * 1000;

  const searchCache = new Map();
  async function clipsFor(query) {
    if (searchCache.has(query)) return searchCache.get(query);

    const diskPath = path.join(SEARCH_DIR, crypto.createHash('md5').update(query).digest('hex') + '.json');
    if (fs.existsSync(diskPath) && Date.now() - fs.statSync(diskPath).mtimeMs < SEARCH_TTL) {
      try {
        const cached = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
        if (cached.length) { searchCache.set(query, cached); return cached; }
      } catch (e) { /* fall through and refetch */ }
    }

    const api = `https://pixabay.com/api/videos/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=40&safesearch=true`;
    let hits = [];
    try {
      hits = JSON.parse((await getBuf(api)).toString()).hits || [];
    } catch (e) {
      console.warn(`  pixabay "${query}" failed: ${describe(e)}`);
    }
    // Relevance first, then how well the clip has done with other people, then
    // resolution. Sorting on tag match alone kept surfacing blurry extreme
    // close-ups that technically matched a word but looked like nothing.
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const score = (h) => {
      const tags = (h.tags || '').toLowerCase();
      const matched = words.reduce((acc, w) => acc + (tags.includes(w) ? 1 : 0), 0);
      const relevance = words.length ? matched / words.length : 0;
      const popularity = Math.log10(1 + (h.downloads || 0)) / 6;      // ~0 to 1
      const best = h.videos?.large || h.videos?.medium || h.videos?.small || {};
      const vertical = (best.height || 0) >= (best.width || 1) ? 0.15 : 0;
      const big = (best.width || 0) >= 1080 ? 0.1 : 0;
      return relevance * 2 + popularity + vertical + big;
    };
    hits.sort((a, b) => score(b) - score(a));
    // Never cache an empty result: that would turn one failed lookup into a
    // permanent hole for every later cue that shares the query.
    if (hits.length) {
      searchCache.set(query, hits);
      try { fs.writeFileSync(diskPath, JSON.stringify(hits)); } catch (e) { /* cache is optional */ }
    }
    return hits;
  }

  const usedVideoIds = new Set();
  const listLines = [];
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const dur = Math.max(0.6, c.clipEnd - c.clipStart);
    const seg = path.join(WORK, `seg${String(i).padStart(3, '0')}.mp4`);
    const keyPath = seg + '.key';
    const key = `${c.query}|${dur.toFixed(3)}`;
    listLines.push(`file '${path.basename(seg)}'`);
    if (fs.existsSync(seg) && fs.existsSync(keyPath) && fs.readFileSync(keyPath, 'utf8') === key) continue;

    // A cue may carry its own footage (own filming, or an offline test run).
    // Otherwise go to Pixabay.
    const raw = path.join(WORK, `raw${i}.mp4`);
    if (c.clipFile && fs.existsSync(c.clipFile)) {
      fs.copyFileSync(c.clipFile, raw);
    } else {
      let hits = await clipsFor(c.query);
      if (!hits.length) hits = await clipsFor('abstract background');
      if (!hits.length) throw new Error(`no stock footage for "${c.query}"`);
      // prefer one we have not used yet in this video, so neighbours never match
      const hit = hits.find((h) => !usedVideoIds.has(h.id)) || hits[i % hits.length];
      usedVideoIds.add(hit.id);
      const v = hit.videos.large || hit.videos.medium || hit.videos.small;

      const cached = path.join(CLIP_DIR, `${hit.id}.mp4`);
      if (!fs.existsSync(cached) || fs.statSync(cached).size === 0) {
        fs.writeFileSync(cached, await getBuf(v.url));
      }
      fs.copyFileSync(cached, raw);
    }

    const bigW = Math.round(W * 1.25), bigH = Math.round(H * 1.25);
    const z = i % 2 === 0 ? 'min(1.0+0.0014*on,1.25)' : 'max(1.25-0.0014*on,1.0)';
    ff(['-stream_loop', '-1', '-i', raw, '-t', dur.toFixed(3),
      '-vf', `scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH},`
        + `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', seg]);
    fs.unlinkSync(raw);
    fs.writeFileSync(keyPath, key);
    if ((i + 1) % 5 === 0 || i === cues.length - 1) console.log(`  clips ${i + 1}/${cues.length}`);
  }

  fs.writeFileSync(path.join(WORK, 'list.txt'), listLines.join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'novoice.mp4'], WORK);

  // 5) subtitles — Rule 1 lives here. Start and end come from the SPEECH times,
  //    not the clip times, so nothing is on screen before the narrator gets there.
  const font = await ensureFont();
  fs.copyFileSync(font.file, path.join(WORK, path.basename(font.file)));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${font.family},72,&H00FFFFFF,&H000000FF,&H00000000,&H78000000,-1,0,0,0,100,100,0,0,1,7,4,5,90,90,0,1
Style: Brand,${font.family},40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,1,8,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Dead centre of the frame is not a style choice. Instagram crops the profile
  // grid tile to 4:5 out of this 9:16 frame, so only the middle survives; a
  // caption parked near the bottom would be cropped clean off the grid.
  const place = '{\\an5\\pos(540,960)';
  const capWindows = [];
  const events = cues.map((c, i) => {
    const start = c.speakStart;
    const isLast = i === cues.length - 1;
    // hold briefly, but never bleed into the next line
    const nextStart = isLast ? TOTAL : cues[i + 1].speakStart;
    /*
     * The closing card is the one caption that must NOT vanish when the
     * narrator stops. The video runs on for a moment after the last word so
     * there is time to read it and tap, and for that moment the card has to
     * still be there — with the pointing hand, which was already held to the
     * end. Leaving the text on the speech rule meant the words disappeared and
     * the emoji sat there on its own.
     */
    const end = c.card
      ? TOTAL
      : Math.min(c.speakEnd + CAPTION_TAIL, nextStart - 0.02, TOTAL);
    if (end <= start) return null;
    capWindows.push({ start, end });
    // The hook does not fade in. Frame 0 is the fallback thumbnail everywhere
    // that will not take an offset (YouTube), and a 110 ms fade means that very
    // frame carries no text at all.
    const fade = i === 0 ? '\\fad(0,90)}' : '\\fad(110,90)}';
    return `Dialogue: 0,${tc(start)},${tc(end)},Cap,,0,0,0,,${place}${fade}${rtl(c.he)}`;
  }).filter(Boolean);

  if (C.brand) events.unshift(`Dialogue: 0,${tc(0)},${tc(TOTAL)},Brand,,0,0,0,,{\\an8\\pos(540,120)}${C.brand}`);
  fs.writeFileSync(path.join(WORK, 'subs.ass'), header + events.join('\n') + '\n', 'utf8');

  // 6) mux. Music is always present, and it ducks under the narration via a
  //    sidechain compressor so the voice stays clearly on top.
  const musicSrc = C.musicFile;
  const hasMusic = musicSrc && fs.existsSync(musicSrc);
  if (!hasMusic) throw new Error('no background music supplied — every video must have a bed');
  fs.copyFileSync(musicSrc, path.join(WORK, 'bg.mp3'));

  // The pointing hand rides under the last caption, on screen only while the
  // call to action is being spoken.
  const ctaCue = cues[cues.length - 1];
  const wantsEmoji = /\u{1F447}/u.test(ctaCue.he || '');
  const emojiPath = wantsEmoji ? await ensureEmoji() : null;
  if (emojiPath) fs.copyFileSync(emojiPath, path.join(WORK, 'emoji.png'));

  const inputs = ['-i', 'novoice.mp4', '-i', 'voice.wav', '-stream_loop', '-1', '-i', 'bg.mp3'];
  const audioFc =
    '[1:a]apad,asplit=2[v1][v2];'
    + `[2:a]loudnorm=I=-26:TP=-2,afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, TOTAL - 2.5).toFixed(2)}:d=2.5[bg0];`
    + '[bg0][v1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bg];'
    // The TTS comes back mono at 24 kHz. Instagram and TikTok expect 48 kHz
    // stereo, so the mix is resampled up before it leaves the graph.
    + '[v2][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,'
    + 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]';
  // A flat dim over the whole frame, plus a soft dark band behind the caption
  // row. Without the band, white text on a bright clip is genuinely hard to read
  // on a phone in daylight. The band is a sine-faded alpha gradient rather than
  // a drawbox, because a hard rectangle edge reads as an amateur overlay.
  const BAND_H = 420;
  const bandPath = path.join(WORK, 'band.png');
  ff(['-f', 'lavfi', '-i', `color=black:s=${W}x${BAND_H}`,
    '-vf', `format=rgba,geq=r=0:g=0:b=0:a='150*sin(PI*Y/${BAND_H})'`,
    '-frames:v', '1', bandPath], WORK);

  // Input order from here is fixed: 3 = band, 4 = emoji if present.
  inputs.push('-loop', '1', '-i', 'band.png');
  const BAND_IDX = 3;

  let videoFc = '[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.28:t=fill[dim];'
    + `[dim][${BAND_IDX}:v]overlay=0:${Math.round(H / 2 - BAND_H / 2)}[band];`
    + '[band]ass=subs.ass:fontsdir=.';
  if (emojiPath) {
    inputs.push('-loop', '1', '-i', 'emoji.png');
    const EMOJI_IDX = 4;
    const size = 92;
    // Sit the hand at the end of the LAST line rather than under the block.
    // With a three line card, "under the block" lands on top of the third line.
    // Hebrew runs right to left, so the end of the line is its left edge.
    const LINE_H = 88;
    const AVG_CHAR = 34; // rough advance width for the caption size
    // Split BEFORE stripping: stripEmoji collapses whitespace, so stripping
    // first flattens the card to one row and the hand lands beside line one.
    const lines = String(ctaCue.he).split('\n').map((l) => stripEmoji(l));
    const lastLine = [...lines].reverse().find((l) => l.length) || '';
    const lastWidth = lastLine.length * AVG_CHAR;
    const lastCentreY = 960 + Math.round(((lines.length - 1) / 2) * LINE_H);
    const x = Math.max(20, Math.round(W / 2 - lastWidth / 2) - 12 - size);
    const y = lastCentreY - Math.round(size / 2);
    videoFc += `[vs];[${EMOJI_IDX}:v]scale=${size}:${size}[em];[vs][em]overlay=${x}:${y}`
      + `:enable='between(t,${ctaCue.speakStart.toFixed(2)},${TOTAL.toFixed(2)})'[v]`;
  } else {
    videoFc += '[v]';
  }

  console.log('  muxing...');
  ff([...inputs, '-filter_complex', `${videoFc};${audioFc}`, '-map', '[v]', '-map', '[a]',
    '-t', String(TOTAL), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-r', String(FPS),
    '-movflags', '+faststart', 'final.mp4'], WORK);

  const outFile = path.join(OUT_DIR, 'video.mp4');
  fs.copyFileSync(path.join(WORK, 'final.mp4'), outFile);
  fs.rmSync(WORK, { recursive: true, force: true });

  /*
   * 7) the grid tile.
   *
   * Instagram and TikTok build the thumbnail from ONE frame of the video, and
   * left to themselves they pick it. In practice they land in a silent gap, so
   * the tile that sits on the profile forever shows stock footage with no
   * caption on it and nothing to read. Buffer lets us name the frame
   * (assets[].video.metadata.thumbnailOffset, in ms), so name one where a
   * caption is fully up. That number is written beside the video and read back
   * at scheduling time.
   */
  const coverMs = pickCoverMs(outFile, capWindows, TOTAL, { FFMPEG });
  fs.writeFileSync(coverPathFor(outFile),
    JSON.stringify({ thumbnailOffsetMs: coverMs }, null, 2) + '\n');

  console.log(`  done -> ${outFile} (${probeDur(outFile).toFixed(1)}s, cover at ${(coverMs / 1000).toFixed(2)}s)`);
  return outFile;
}

// ------------------------------------------------------------ grid cover ----

const coverPathFor = (videoFile) => videoFile.replace(/\.mp4$/i, '') + '.cover.json';

/*
 * Read back the thumbnail offset a render chose. Returns null when there is no
 * sidecar, which is what an older render or a hand-made file looks like — the
 * caller then simply schedules without one, exactly as before.
 */
function coverOffsetMs(videoFile) {
  try {
    const v = JSON.parse(fs.readFileSync(coverPathFor(videoFile), 'utf8')).thumbnailOffsetMs;
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    return null;
  }
}

/*
 * Pick the frame the grid should show.
 *
 * Candidates are the middle of each of the first few caption windows, which is
 * the only place a caption is guaranteed to be at full opacity. Between them,
 * skip anything whose grid crop comes back nearly black: stock clips very often
 * open on a fade up from black, and a black tile with white text on it is still
 * a black tile.
 */
function pickCoverMs(videoFile, capWindows, total, { FFMPEG }) {
  const CROP_H = Math.round(W * 5 / 4);          // the 4:5 tile Instagram shows
  const CROP_Y = Math.round((H - CROP_H) / 2);
  const DARK = 28;                               // mean luma, 0 to 255

  const candidates = capWindows.slice(0, 3)
    .map((w) => {
      const mid = w.start + (w.end - w.start) / 2;
      return Math.min(Math.max(mid, w.start + 0.25), w.end - 0.08);
    })
    .filter((t) => t > 0 && t < total);
  if (!candidates.length) return 0;

  // Scaling the crop to a single pixel IS the average: one byte back per frame.
  const lumaAt = (t) => {
    try {
      const out = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error',
        '-ss', t.toFixed(3), '-i', videoFile, '-frames:v', '1',
        '-vf', `crop=${W}:${CROP_H}:0:${CROP_Y},scale=1:1`,
        '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4096 });
      return out.length ? out[0] : 0;
    } catch (e) {
      return 0; // a probe failure must never cost us the render
    }
  };

  const scored = candidates.map((t) => ({ t, y: lumaAt(t) }));
  // First bright enough wins, so the hook keeps priority whenever it is usable.
  const chosen = scored.find((s) => s.y >= DARK)
    || scored.slice().sort((a, b) => b.y - a.y)[0];
  return Math.max(0, Math.round(chosen.t * 1000));
}

module.exports = { render, rtlForTest: rtl, coverOffsetMs };

if (require.main === module) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const p = process.argv[2];
  if (!p) { console.error('Usage: node scripts/render_video.js <content.json>'); process.exit(1); }
  render(JSON.parse(fs.readFileSync(p, 'utf8')))
    .catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
