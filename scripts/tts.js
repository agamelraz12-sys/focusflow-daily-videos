'use strict';
/*
 * tts.js — Hebrew narration, one line at a time, cached.
 *
 * Three providers, and the default is deliberate.
 *
 * ElevenLabs has NO Hebrew voices. Its shared library returns zero results for
 * Hebrew, and eleven_v3 only bends an English-trained voice towards the
 * language. It passes a speech-to-text round trip word for word — which is why
 * the first version shipped — but intelligible is not the same as natural, and
 * to a native ear it is plainly a foreigner reading Hebrew. That was the
 * founder's verdict on the first published videos and she was right.
 *
 * Microsoft's he-IL voices are trained on Hebrew rather than adapted to it.
 * They sound like Hebrew, and they cost nothing. The founder rejected them too.
 *
 * Google's gemini-2.5-flash-preview-tts is the third attempt and the one in use.
 * It reads Hebrew natively: a round trip back through speech recognition returns
 * the line word for word and identifies the speaker as a native Hebrew speaker,
 * which neither of the other two managed. The key is already in .env for the
 * writer, so it costs nothing extra.
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
 * The founder rejected both by ear, and for a while the narrator spoke English
 * with the Hebrew living in the subtitles.
 *
 * It speaks Hebrew again (2026-09-12) on Gemini. Cloning the founder's own
 * voice was offered as the stronger option and she declined it, so the voice is
 * synthetic and chosen for character rather than for sounding like anybody.
 */
const NARRATION_LANG = () => (process.env.NARRATION_LANG || 'he').toLowerCase();

const VOICE_BY_LANG = {
  en: 'en-US-ChristopherNeural',   // deep, unhurried, carries a serious line
  he: 'he-IL-HilaNeural',          // native Hebrew; he-IL-AvriNeural is the male one
};

const DEFAULT_EDGE_VOICE = VOICE_BY_LANG.en;

// Only eleven_v3 accepts Hebrew at all; multilingual_v2 rejects the language.
const EL_MODEL = 'eleven_v3';
const EL_DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

/*
 * Gemini. The pro TTS model is not on the free tier, so flash is the one that
 * runs. It returns raw signed 16 bit PCM at 24 kHz mono with no container,
 * which is why the response is piped through ffmpeg rather than written out.
 *
 * Sulafat out of the thirty prebuilt voices. Eight were generated saying the
 * same brand line and checked three ways: two read it at twice the length of
 * the rest and were dropped on pace alone, one came back rated robotic, and the
 * remaining five were all judged natural and word accurate. Ranking those five
 * by ear is beyond what an automated listener can do honestly — asking a model
 * to rank them put whichever sample sat in slot D on top both times, forwards
 * and backwards, so that ranking was thrown away. Sulafat is Google's warm
 * voice, and warmth is the point on an account whose whole argument is that the
 * viewer is not lazy. Change GEMINI_TTS_VOICE to overrule it.
 */
const GEMINI_TTS_MODEL = () => process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE = () => process.env.GEMINI_TTS_VOICE || 'Sulafat';
const GEMINI_PCM_RATE = 24000;

const provider = () => (process.env.TTS_PROVIDER || 'gemini').toLowerCase();
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
  // The id has to name the exact engine AND voice. Two providers speaking the
  // same line must not collide, or switching voice silently replays the old one.
  let id;
  if (provider() === 'elevenlabs') id = `el|${elVoice()}|${EL_MODEL}`;
  else if (provider() === 'gemini') id = `gem|${GEMINI_TTS_VOICE()}|${GEMINI_TTS_MODEL()}`;
  else id = `edge|${edgeVoice()}`;
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

// The fallback path pins the Hebrew voice explicitly rather than going through
// edgeVoice(), which follows EDGE_VOICE_ID and could point anywhere.
function edgeSayHebrew(text, outPath) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  return new Promise((resolve, reject) => {
    (async () => {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(VOICE_BY_LANG.he, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
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

// ---------------------------------------------------------------- gemini ---

/*
 * A refusal here is usually the daily free quota rather than a bad request, and
 * quota comes back on its own, so 429 and 5xx are retried with a long back off.
 * A 400 is a real mistake in the call and fails immediately.
 */
/*
 * Deliberately https.request and not fetch.
 *
 * lib/net.js sets dns.setDefaultResultOrder('ipv4first') because this machine
 * resolves AAAA first and that path drops sockets mid run. Node's fetch goes
 * through undici, which does its own DNS resolution and ignores that setting
 * entirely, so the first version of this function died with a bare "fetch
 * failed" on a host the rest of the project talks to without trouble.
 */
function geminiPost(payload) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is missing. Put it in .env');
  const body = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${GEMINI_TTS_MODEL()}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'x-goog-api-key': key,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString()); } catch (e) { /* keep {} */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function geminiSay(text, outPath) {
  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE() } } },
    },
  };

  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await geminiPost(payload);
    } catch (e) {
      last = e.message;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    const b64 = res.body?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (res.status === 200 && b64) {
      writePcmAsMp3(Buffer.from(b64, 'base64'), outPath);
      return;
    }
    last = `HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`;
    // A 200 with no audio happens when the model returns a text refusal, and a
    // 4xx other than 429 is a real mistake in the call. Neither improves on a
    // retry of the identical request.
    if (res.status !== 429 && res.status < 500) break;
    // The daily cap is not going to clear inside a render. Give up on the
    // first 429 so the caller can fall back instead of stalling for a minute.
    if (res.status === 429) break;
    await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
  }
  throw new Error(`Gemini refused "${text.slice(0, 30)}..." — ${last}`);
}

// Gemini hands back headerless PCM, so ffmpeg has to be told the shape of it.
function writePcmAsMp3(pcm, outPath) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const raw = `${outPath}.pcm`;
  fs.writeFileSync(raw, pcm);
  try {
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
      '-f', 's16le', '-ar', String(GEMINI_PCM_RATE), '-ac', '1', '-i', raw,
      '-codec:a', 'libmp3lame', '-b:a', '128k', outPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    // execFileSync throws with an empty message under stdio inherit; stderr is
    // captured above precisely so this line says something useful.
    throw new Error(`ffmpeg could not convert Gemini PCM: ${e.stderr ? e.stderr.toString().slice(0, 200) : e.message}`);
  } finally {
    try { fs.unlinkSync(raw); } catch (e2) { /* nothing to clean */ }
  }
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

  /*
   * Gemini, and what happens when it runs out.
   *
   * The free tier allows TEN generate requests per day on the TTS model
   * (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier, value 10). One
   * video is about eighteen lines, so on the free tier the good voice covers
   * roughly half a video a day and then stops. It passed every isolated test
   * precisely because those tests were small.
   *
   * A render must not die because of that. When Gemini is exhausted the line
   * is spoken by Microsoft's native he-IL voice instead, which is free and
   * unmetered: a worse voice, still Hebrew, and the video still ships. The
   * fallback is announced loudly rather than swallowed, because the whole
   * point of the change was the voice, and a silent downgrade would look like
   * it simply had not worked.
   */
  if (provider() === 'gemini') {
    try {
      await geminiSay(clean, file);
      trimSilence(file);
      return { file, duration: durationOf(file, ffprobe), cached: false, characters: clean.length };
    } catch (e) {
      /*
       * Fall back for the two reasons that are not our fault: the daily cap,
       * and the network. A 400 or a 403 means the key or the request is wrong,
       * and falling back there would hide a broken configuration behind a
       * quietly worse voice for weeks.
       */
      const quota = /HTTP 429/.test(e.message);
      const network = /ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|socket hang up|fetch failed/i.test(e.message);
      if (!quota && !network) throw e;
      if (!speak._warned) {
        console.warn(quota
          ? '  Gemini TTS daily free quota is gone (10 requests a day). Falling back to he-IL Hila for the rest of this run.'
          : `  Gemini TTS unreachable (${e.message.slice(0, 80)}). Falling back to he-IL Hila for the rest of this run.`);
        if (quota) console.warn('  Enable billing on the Gemini API project to keep the Sulafat voice.');
        speak._warned = true;
      }
      try { fs.unlinkSync(file); } catch (e2) { /* nothing to clean */ }
      const fallback = path.join(CACHE_DIR, `${crypto.createHash('md5')
        .update(`${clean}|edge|${VOICE_BY_LANG.he}|${CACHE_VERSION}`).digest('hex')}.mp3`);
      if (fs.existsSync(fallback) && fs.statSync(fallback).size > 1024) {
        return { file: fallback, duration: durationOf(fallback, ffprobe), cached: true, characters: 0 };
      }
      await edgeSayHebrew(clean, fallback);
      trimSilence(fallback);
      return { file: fallback, duration: durationOf(fallback, ffprobe), cached: false, characters: 0 };
    }
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

module.exports = { speak, CACHE_DIR, provider, edgeVoice, narrationTextOf, NARRATION_LANG, DEFAULT_EDGE_VOICE, GEMINI_TTS_VOICE, GEMINI_TTS_MODEL };
