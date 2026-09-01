'use strict';
/*
 * music.js — the background bed.
 *
 * Composed by ElevenLabs from a prompt. Three reasons this beats the
 * alternatives that were tried first:
 *
 *  - Pixabay has no music API at all (the audio endpoint 403s, there is no
 *    music endpoint), so the obvious source was never available.
 *  - Jamendo's free catalogue is mostly NonCommercial, which does not cover
 *    marketing a paid product, and the CC BY tracks that remain demand an
 *    artist credit in every caption.
 *  - The locally synthesised pad that filled the gap is calm but inert. The
 *    founder's words after seeing the first published videos: she wants music
 *    that pulls people in. A drone does not.
 *
 * Tracks are generated once and cached. A viewer will not notice a bed
 * repeating across days the way they would notice a repeated script, so there
 * is no reason to pay for new ones every night.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MUSIC_DIR = path.join(ROOT, 'assets', 'music');
const INDEX_PATH = path.join(MUSIC_DIR, 'index.json');

const TRACK_MS = 75000; // comfortably longer than a ~65 second video

/*
 * Varied enough that six videos in a day do not sound like one long video, all
 * of them under-a-voice friendly: nothing with a lead line that competes.
 */
const BRIEFS = [
  {
    key: 'lift',
    prompt: 'Uplifting cinematic underscore for a short motivational video. Warm piano over soft strings, '
      + 'a steady hopeful pulse that grows gently. No vocals. Nothing busy in the mid range, it must sit under a speaking voice.',
  },
  {
    key: 'pulse',
    prompt: 'Modern minimal underscore with a quiet driving pulse. Muted synth arpeggio, deep soft bass, '
      + 'light percussion kept low. Focused and forward moving, not aggressive. No vocals, no lead melody.',
  },
  {
    key: 'dawn',
    prompt: 'Calm hopeful ambient with a slow chord progression on felt piano and warm pads. '
      + 'Spacious and unhurried, like early morning. No vocals, no drums.',
  },
  {
    key: 'resolve',
    prompt: 'Understated cinematic build for a serious message. Low sustained strings, a simple repeating figure, '
      + 'tension that resolves warmly by the end. No vocals, restrained percussion.',
  },
  {
    key: 'glow',
    prompt: 'Soft electronic underscore, gentle and encouraging. Rounded synth pads, subtle plucks, '
      + 'a light steady heartbeat underneath. Optimistic. No vocals, nothing sharp.',
  },
  {
    key: 'steady',
    prompt: 'Quietly confident instrumental. Clean guitar harmonics over warm pads with a soft kick keeping time. '
      + 'Reassuring and grounded. No vocals, no busy fills.',
  },
];

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch (e) { return { tracks: [] }; }
}

function saveIndex(idx) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2) + '\n', 'utf8');
}

function compose(prompt) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing');
  const body = Buffer.from(JSON.stringify({ prompt, music_length_ms: TRACK_MS }));
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io', path: '/v1/music', method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${buf.toString().slice(0, 200)}`));
        if (buf.length < 20000) return reject(new Error('response too small to be audio'));
        resolve(buf);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}



// ------------------------------------------------------ her own library ---

/*
 * The songs the founder supplied herself, in "שירים לאינסטגרם" next to this
 * repo. Real tracks with vocals, and — the part that matters — cleared by her,
 * so there is no licence question and no artist credit to bolt onto every
 * caption. This beats every source that came before it: Pixabay has no music
 * API, Jamendo needs an account, archive.org's free-for-commercial pool turned
 * out to be mostly grindcore and noise, and ElevenLabs is out of credits.
 *
 * Point SONGS_DIR somewhere else to use a different library.
 */
const SONGS_DIR = process.env.SONGS_DIR
  || path.join(ROOT, '..', 'שירים לאינסטגרם');

/*
 * Songs open with an intro that has not got going yet. Starting a sixty second
 * reel on it wastes the part of the track that carries the feeling, so skip in
 * to where the song has arrived.
 */
const SONG_START_SEC = Number(process.env.SONG_START_SEC || 24);

function libraryTracks() {
  if (!fs.existsSync(SONGS_DIR)) return [];
  return fs.readdirSync(SONGS_DIR)
    .filter((f) => /.(mp3|m4a|wav|aac)$/i.test(f))
    .sort()
    .map((f) => {
      // "All For You - Anno Domini Beats.mp3" -> title and artist
      const base = f.replace(/.[^.]+$/, '');
      const dash = base.lastIndexOf(' - ');
      return {
        key: 'lib-' + base,
        file: f,
        dir: SONGS_DIR,
        name: dash > 0 ? base.slice(0, dash) : base,
        artist: dash > 0 ? base.slice(dash + 3) : '',
        song: true,
        owned: true,
        startSec: SONG_START_SEC,
      };
    });
}

// --------------------------------------------------------------- jamendo ---

/*
 * Real songs, by real artists, with vocals — which is what "songs" means when
 * she asks for them, and what a composed instrumental bed never quite is.
 *
 * Licensing is the whole game here. Jamendo's free catalogue is mostly
 * NonCommercial, which does NOT cover marketing a paid product, so only CC BY
 * and CC BY-SA are kept. Those allow commercial use provided the artist is
 * named, so every track used is written to assets/music/CREDITS.md and the
 * credit line goes back into the post caption.
 */
const SONG_MOODS = [
  'uplifting+pop',
  'energetic+electronic',
  'motivational+cinematic',
  'happy+indie',
  'powerful+rock',
  'chill+hiphop',
];

function commercialSafe(track) {
  const lic = String(track.license_ccurl || '');
  if (!lic) return false;
  if (/-nc/.test(lic) || /\/nc/.test(lic)) return false;   // NonCommercial: unusable here
  if (/-nd/.test(lic)) return false;                       // NoDerivatives: we mix under speech
  return /\/(by|by-sa)\//.test(lic);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function credit(track) {
  const line = '- "' + track.name + '" by ' + track.artist_name + ' — ' + track.license_ccurl + ' — ' + track.shareurl + '\n';
  const p = path.join(MUSIC_DIR, 'CREDITS.md');
  const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '# Music credits\n\n';
  if (!existing.includes(track.shareurl)) fs.writeFileSync(p, existing + line, 'utf8');
}

async function fetchSongs(clientId, want, have, haveKeys) {
  for (const mood of SONG_MOODS) {
    if (have.length >= want) break;
    const api = 'https://api.jamendo.com/v3.0/tracks/?client_id=' + clientId
      + '&format=json&limit=40&fuzzytags=' + mood
      + '&audioformat=mp32&order=popularity_total&durationbetween=60_420&include=licenses';
    let hits;
    try {
      hits = JSON.parse((await httpGet(api)).toString()).results || [];
    } catch (e) {
      console.warn('  jamendo "' + mood + '" search failed (' + e.message + ')');
      continue;
    }
    for (const t of hits) {
      if (have.length >= want) break;
      const key = 'jam-' + t.id;
      if (haveKeys.has(key) || !commercialSafe(t)) continue;
      const src = t.audiodownload_allowed && t.audiodownload ? t.audiodownload : t.audio;
      if (!src) continue;
      const file = 'song_' + t.id + '.mp3';
      try {
        fs.writeFileSync(path.join(MUSIC_DIR, file), await httpGet(src));
      } catch (e) {
        console.warn('  could not fetch "' + t.name + '" (' + e.message + ')');
        continue;
      }
      credit(t);
      haveKeys.add(key);
      have.push({ key, file, name: t.name, artist: t.artist_name, synth: false, song: true });
      console.log('  song: "' + t.name + '" by ' + t.artist_name);
    }
  }
}

// ------------------------------------------------------------- fallback ----

/*
 * If composing fails, fall back to a locally built pad so a run never dies for
 * want of music. It is dull, and it is meant to be a floor, not a choice.
 */
function synthBed(index, outPath) {
  const os = require('os');
  const ff = (args) => execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'ignore' });
  const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bed-'));
  const parts = [];
  chords.forEach((chord, ci) => {
    const file = path.join(tmp, `c${ci}.wav`);
    const inputs = [];
    chord.forEach((f) => inputs.push('-f', 'lavfi', '-i', `sine=frequency=${f}:duration=8:sample_rate=48000`));
    ff([...inputs, '-filter_complex',
      `${chord.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${chord.length},afade=t=in:st=0:d=2.5,afade=t=out:st=5:d=3[a]`,
      '-map', '[a]', file]);
    parts.push(file);
  });
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const joined = path.join(tmp, 'loop.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  ff(['-stream_loop', '2', '-i', joined,
    '-af', 'lowpass=f=1400,aecho=0.8:0.85:420|780:0.32|0.22,volume=0.55',
    '-c:a', 'libmp3lame', '-q:a', '4', outPath]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// --------------------------------------------------------------- public ----

/*
 * Make sure `want` beds exist on disk, composing whatever is missing.
 */
async function stock(want = BRIEFS.length) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  const idx = loadIndex();
  const have = idx.tracks.filter((t) => fs.existsSync(path.join(MUSIC_DIR, t.file)));
  const haveKeys = new Set(have.map((t) => t.key));

  // Her own library wins outright when it is there: real songs, already
  // cleared by her, so no licence question and no credit line in the caption.
  const own = libraryTracks();
  if (own.length) {
    console.log('  using ' + own.length + ' songs from your own library');
    return own;
  }

  // Real songs first when a Jamendo id exists. Composed beds are the fallback,
  // and they are also what runs when ElevenLabs credits are exhausted.
  const jamendoId = process.env.JAMENDO_CLIENT_ID;
  if (jamendoId) {
    await fetchSongs(jamendoId, want, have, haveKeys);
    if (have.length) {
      idx.tracks = have;
      saveIndex(idx);
      return have;
    }
  }

  for (const brief of BRIEFS.slice(0, want)) {
    if (haveKeys.has(brief.key)) continue;
    const file = `bed_${brief.key}.mp3`;
    const full = path.join(MUSIC_DIR, file);
    try {
      console.log(`  composing "${brief.key}"...`);
      fs.writeFileSync(full, await compose(brief.prompt));
      have.push({ key: brief.key, file, name: brief.key, artist: 'ElevenLabs', synth: false });
    } catch (e) {
      console.warn(`  could not compose "${brief.key}" (${e.message}), using a synthesised pad`);
      try {
        synthBed(have.length, full);
        have.push({ key: brief.key, file, name: `פסקול רגוע`, artist: 'נוצר מקומית', synth: true });
      } catch (e2) {
        console.warn(`  and the fallback failed too: ${e2.message}`);
      }
    }
  }

  idx.tracks = have;
  saveIndex(idx);
  if (!have.length) throw new Error('no background music available at all');
  return have;
}

/*
 * Pick the bed for video number `n`. Walking by index means six videos in one
 * day never share a track.
 */
function pick(tracks, n) {
  const t = tracks[n % tracks.length];
  return {
    path: path.join(t.dir || MUSIC_DIR, t.file),
    startSec: t.startSec || 0,
    track: t,
  };
}

module.exports = { stock, pick, MUSIC_DIR, BRIEFS };

if (require.main === module) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  stock(Number(process.argv[2]) || BRIEFS.length)
    .then((t) => {
      console.log(`\n${t.length} beds ready in ${MUSIC_DIR}`);
      t.forEach((x) => console.log(`  ${x.file}  ${x.synth ? '(fallback pad)' : '(composed)'}`));
    })
    .catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
