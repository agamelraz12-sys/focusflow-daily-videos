'use strict';
/*
 * tts.js — Hebrew narration, one line at a time, cached.
 *
 * Two providers, and the default is deliberate.
 *
 * ElevenLabs has NO Hebrew voices. Its shared library returns zero results for
 * Hebrew, and eleven_v3 only bends an English-trained voice towards the
 * language. It passes a speech-to-text round trip word for word — which is why
 * the first version shipped — but intelligible is not the same as natural, and
 * to a native ear it is plainly a foreigner reading Hebrew. That was the
 * founder's verdict on the first published videos and she was right.
 *
 * Microsoft's he-IL voices are trained on Hebrew rather than adapted to it.
 * They sound like Hebrew, and they cost nothing.
 *
 * Speaking line by line and caching by text is kept from the ElevenLabs design
 * because it earns its keep regardless of provider: a line's audio IS its
 * subtitle window, so a caption physically cannot appear before the narrator
 * reaches it, and the closing card is rendered once rather than every video.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'assets', 'voice-cache');

/*
 * Which language the narrator speaks. This is a content decision, not a
 * technical one, and it has been made twice.
 *
 * Hebrew narration was tried with ElevenLabs (no Hebrew voices at all, only
 * English ones bending towards it) and then with Microsoft's native he-IL pair.
 * The founder rejected both by ear. Until there is a Hebrew voice that actually
 * sounds human — most likely a clone of her own — the narrator speaks English
 * and the Hebrew lives in the subtitles, which is where it reads best anyway.
 */
const NARRATION_LANG = () => (process.env.NARRATION_LANG || 'en').toLowerCase();

const VOICE_BY_LANG = {
  en: 'en-US-ChristopherNeural',   // deep, unhurried, carries a serious line
  he: 'he-IL-HilaNeural',          // native Hebrew; he-IL-AvriNeural is the male one
};

const DEFAULT_EDGE_VOICE = VOICE_BY_LANG.en;

// Only eleven_v3 accepts Hebrew at all; multilingual_v2 rejects the language.
const EL_MODEL = 'eleven_v3';
const EL_DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

const provider = () => (process.env.TTS_PROVIDER || 'edge').toLowerCase();
const edgeVoice = () => process.env.EDGE_VOICE_ID || VOICE_BY_LANG[NARRATION_LANG()] || DEFAULT_EDGE_VOICE;

// Which field of a cue the narrator reads.
const narrationTextOf = (cue) => (NARRATION_LANG() === 'he' ? cue.he : cue.en);
const elVoice = () => process.env.ELEVENLABS_VOICE_ID || EL_DEFAULT_VOICE;

// Bump when the audio treatment changes, so old cache entries are not reused.
const CACHE_VERSION = 'v3-trimmed-tempo';

/*
 * A touch faster than the engine's default. Neural TTS reads at a measured
 * pace that suits an audiobook and drags in a reel, and 1.1 is the most that
 * still sounds unhurried. Combined with trimming the padding this took a
 * hundred second video down towards sixty.
 */
const TEMPO = Number(process.env.NARRATION_TEMPO || 1.1);

function cacheKey(text) {
  const id = provider() === 'elevenlabs' ? `el|${elVoice()}|${EL_MODEL}` : `edge|${edgeVoice()}`;
  return crypto.createHash('md5').update(`${text}|${id}|${CACHE_VERSION}`).digest('hex');
}

/*
 * Every engine pads an utterance with a beat of silence at each end. Harmless
 * once; across eighteen separately spoken lines it added roughly forty seconds
 * of nothing and turned a sixty second reel into a hundred second one. Trim it
 * before caching, so the cost is paid once per line rather than every render.
 */
function trimSilence(file) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const tmp = file.replace(/\.mp3$/, '.trim.mp3');
  const gate = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0:detection=peak';
  const tempo = TEMPO && TEMPO !== 1 ? `,atempo=${TEMPO.toFixed(2)}` : '';
  try {
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file,
      '-af', `${gate},areverse,${gate},areverse${tempo}`, tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 512) {
      fs.renameSync(tmp, file);
    } else {
      try { fs.unlinkSync(tmp); } catch (e) { /* nothing to clean */ }
    }
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* nothing to clean */ }
  }
}

function durationOf(file, ffprobe) {
  const out = execFileSync(ffprobe || 'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  return parseFloat(out);
}

// ------------------------------------------------------------------ edge ---

function edgeSay(text, outPath) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  return new Promise((resolve, reject) => {
    (async () => {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(edgeVoice(), OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const out = fs.createWriteStream(outPath);
      audioStream.on('data', (c) => out.write(c));
      audioStream.on('end', () => { out.end(); out.on('finish', resolve); });
      audioStream.on('error', reject);
    })().catch(reject);
  });
}

// ------------------------------------------------------------ elevenlabs ---

function elPost(pathname, payload) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing. Put it in .env');
  const body = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io', path: pathname, method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function elSay(text, outPath) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await elPost(`/v1/text-to-speech/${elVoice()}?output_format=mp3_44100_128`,
      { text, model_id: EL_MODEL, language_code: 'he' });
    if (r.status === 200) { fs.writeFileSync(outPath, r.buf); return; }
    last = `HTTP ${r.status}: ${r.buf.toString().slice(0, 200)}`;
    if (r.status !== 429 && r.status < 500) break;
    await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
  }
  throw new Error(`ElevenLabs refused "${text.slice(0, 30)}..." — ${last}`);
}

// ---------------------------------------------------------------- public ---

/*
 * Speak one line. Returns { file, duration, cached, characters }.
 * `characters` is 0 on a cache hit and 0 on Edge, which is free — so the number
 * a run prints is real money, not activity.
 */
async function speak(text, { ffprobe } = {}) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('nothing to speak');
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const file = path.join(CACHE_DIR, `${cacheKey(clean)}.mp3`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
    return { file, duration: durationOf(file, ffprobe), cached: true, characters: 0 };
  }

  if (provider() === 'elevenlabs') {
    await elSay(clean, file);
    trimSilence(file);
    return { file, duration: durationOf(file, ffprobe), cached: false, characters: clean.length };
  }

  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await edgeSay(clean, file);
      if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
        trimSilence(file);
        return { file, duration: durationOf(file, ffprobe), cached: false, characters: 0 };
      }
      last = new Error('Edge returned an empty stream');
    } catch (e) {
      last = e;
    }
    try { fs.unlinkSync(file); } catch (e) { /* nothing to clean */ }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(`could not narrate "${clean.slice(0, 30)}..." — ${last.message}`);
}

module.exports = { speak, CACHE_DIR, provider, edgeVoice, narrationTextOf, NARRATION_LANG, DEFAULT_EDGE_VOICE };
