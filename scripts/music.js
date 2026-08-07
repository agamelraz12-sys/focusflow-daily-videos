'use strict';
/*
 * music.js — background music bed, from Jamendo.
 *
 * Licensing note that matters: Jamendo's free API serves Creative Commons
 * tracks, and most of them are NonCommercial, which does not cover marketing a
 * paid product. This module therefore keeps ONLY tracks licensed CC BY or
 * CC BY-SA, which do allow commercial use as long as the artist is credited.
 * Every track it uses is appended to assets/music/CREDITS.md — that file is the
 * attribution record, and the credit line also goes into the post caption.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const MUSIC_DIR = path.join(ROOT, 'assets', 'music');
const CREDITS_PATH = path.join(MUSIC_DIR, 'CREDITS.md');
const INDEX_PATH = path.join(MUSIC_DIR, 'index.json');

// Calm but not sleepy. These are Jamendo tag searches, tried in order.
const MOODS = [
  'ambient+calm',
  'chillout+relaxing',
  'cinematic+emotional',
  'lofi+mellow',
  'piano+peaceful',
  'downtempo+dreamy',
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url.split('?')[0]}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function commercialSafe(track) {
  const lic = String(track.license_ccurl || '');
  if (!lic) return false;
  if (/-nc/.test(lic) || /\/nc/.test(lic)) return false;   // NonCommercial — not usable here
  if (/-nd/.test(lic)) return false;                        // NoDerivatives — we mix under speech
  return /\/(by|by-sa)\//.test(lic);
}

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch (e) { return { tracks: [] }; }
}

function saveIndex(idx) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2) + '\n', 'utf8');
}

function credit(track) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  const line = `- "${track.name}" by ${track.artist_name} — ${track.license_ccurl} — ${track.shareurl}\n`;
  const existing = fs.existsSync(CREDITS_PATH) ? fs.readFileSync(CREDITS_PATH, 'utf8') : '# Music credits\n\n';
  if (!existing.includes(track.shareurl)) fs.writeFileSync(CREDITS_PATH, existing + line, 'utf8');
}

// ------------------------------------------------------------- fallback ----

/*
 * No Jamendo account yet? Rather than block the whole pipeline, synthesise a
 * calm ambient bed locally. Slow pad chords in A minor with a long tail, mixed
 * far under the narration. It is not a composed track, but it is genuinely
 * calm, it is free of any licence question, and it needs no account.
 *
 * The moment JAMENDO_CLIENT_ID appears, real music takes over and these are
 * ignored.
 */
const PROGRESSIONS = [
  { name: 'שקט', chords: [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]] },
  { name: 'בוקר', chords: [[261.63, 329.63, 392.0], [220, 277.18, 329.63], [196.0, 246.94, 293.66], [174.61, 220, 261.63]] },
  { name: 'ערב', chords: [[196.0, 233.08, 293.66], [174.61, 207.65, 261.63], [155.56, 196.0, 233.08], [130.81, 164.81, 196.0]] },
];

function synthBed(index, outPath, chordSeconds = 8) {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const ff = (args) => execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'ignore' });

  const prog = PROGRESSIONS[index % PROGRESSIONS.length];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bed-'));
  const parts = [];

  prog.chords.forEach((chord, ci) => {
    const file = path.join(tmp, `c${ci}.wav`);
    const inputs = [];
    chord.forEach((f) => { inputs.push('-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${chordSeconds}:sample_rate=48000`); });
    // a soft octave above the root adds air without becoming a melody
    inputs.push('-f', 'lavfi', '-i', `sine=frequency=${(chord[0] * 2).toFixed(2)}:duration=${chordSeconds}:sample_rate=48000`);
    const mix = chord.map((_, i) => `[${i}:a]`).join('') + `[${chord.length}:a]`;
    ff([...inputs, '-filter_complex',
      `${mix}amix=inputs=${chord.length + 1}:weights=1 1 1 0.35,`
      + `afade=t=in:st=0:d=2.5,afade=t=out:st=${(chordSeconds - 3).toFixed(2)}:d=3[a]`,
      '-map', '[a]', file]);
    parts.push(file);
  });

  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const joined = path.join(tmp, 'loop.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

  // three passes through the progression is plenty for a 60 to 80 second video
  ff(['-stream_loop', '2', '-i', joined,
    '-af', 'lowpass=f=1400,aecho=0.8:0.85:420|780:0.32|0.22,volume=0.55',
    '-c:a', 'libmp3lame', '-q:a', '4', outPath]);

  fs.rmSync(tmp, { recursive: true, force: true });
  return { id: `synth-${prog.name}-${index}`, name: `פסקול רגוע ${prog.name}`, artist: 'נוצר מקומית', license: 'none', synth: true };
}

/*
 * Fill the local cache up to `want` tracks. Called once at the start of a run so
 * the six renders that follow never wait on the network.
 */
async function stock(want = 12) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    console.warn('  no JAMENDO_CLIENT_ID — falling back to locally synthesised beds');
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    const made = [];
    for (let i = 0; i < Math.min(want, PROGRESSIONS.length); i++) {
      const file = `synth_${i}.mp3`;
      const full = path.join(MUSIC_DIR, file);
      const meta = fs.existsSync(full)
        ? { name: `פסקול רגוע ${PROGRESSIONS[i].name}`, artist: 'נוצר מקומית', synth: true }
        : synthBed(i, full);
      made.push({ ...meta, id: `synth-${i}`, file, synth: true });
    }
    return made;
  }

  const idx = loadIndex();
  const have = idx.tracks.filter((t) => fs.existsSync(path.join(MUSIC_DIR, t.file)));
  if (have.length >= want) { idx.tracks = have; saveIndex(idx); return have; }

  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  const seen = new Set(have.map((t) => t.id));

  for (const mood of MOODS) {
    if (have.length >= want) break;
    const api = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=40`
      + `&fuzzytags=${mood}&vocalinstrumental=instrumental&audioformat=mp32&order=popularity_total`
      + `&durationbetween=90_600&include=licenses`;
    let hits;
    try {
      hits = JSON.parse((await get(api)).toString()).results || [];
    } catch (e) {
      console.warn(`  music: "${mood}" search failed (${e.message})`);
      continue;
    }
    for (const t of hits) {
      if (have.length >= want) break;
      if (seen.has(t.id) || !commercialSafe(t)) continue;
      const src = t.audiodownload_allowed && t.audiodownload ? t.audiodownload : t.audio;
      if (!src) continue;
      const file = `jamendo_${t.id}.mp3`;
      try {
        fs.writeFileSync(path.join(MUSIC_DIR, file), await get(src));
      } catch (e) {
        console.warn(`  music: could not fetch ${t.id} (${e.message})`);
        continue;
      }
      seen.add(t.id);
      credit(t);
      have.push({ id: t.id, file, name: t.name, artist: t.artist_name, license: t.license_ccurl, mood });
      console.log(`  music: cached "${t.name}" by ${t.artist_name}`);
    }
  }

  idx.tracks = have;
  saveIndex(idx);
  if (!have.length) throw new Error('Jamendo returned no commercially usable instrumental tracks');
  return have;
}

/*
 * Pick a bed for video number `n`. Walking the list by index instead of at
 * random means six videos in one day never share a track.
 */
function pick(tracks, n) {
  const t = tracks[n % tracks.length];
  return { path: path.join(MUSIC_DIR, t.file), track: t };
}

module.exports = { stock, pick, MUSIC_DIR };

if (require.main === module) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  stock(Number(process.argv[2]) || 12)
    .then((t) => console.log(`\n${t.length} tracks ready in ${MUSIC_DIR}`))
    .catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
