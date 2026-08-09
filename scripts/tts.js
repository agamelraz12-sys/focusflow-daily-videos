'use strict';
/*
 * tts.js — Hebrew narration from ElevenLabs, one line at a time, cached.
 *
 * Why per line and not the whole script in one call:
 *
 *  - Cost. ElevenLabs bills by the character. The closing card is identical in
 *    every video ever made, and the body of a video is identical across the
 *    Instagram cut and the TikTok/YouTube cut. Hashing each line means all of
 *    that is paid for once and then reused forever.
 *  - Timing. Each line becomes its own audio file with a known duration, so a
 *    subtitle's window is its clip's audio exactly. "On screen only while the
 *    narrator speaks" stops being a calculation and becomes a fact.
 *
 * Only eleven_v3 speaks Hebrew. eleven_multilingual_v2 rejects the language
 * outright with an unsupported_language error, so do not "optimise" the model
 * id to something cheaper without checking that first.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'assets', 'voice-cache');

const MODEL = 'eleven_v3';
const LANGUAGE = 'he';
const FORMAT = 'mp3_44100_128';

// Sarah. Four of the five voices tested transcribed back word for word; this is
// one of them. Swap the id to change the narrator, nothing else needs touching.
const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

function voiceId() {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
}

function apiKey() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error('ELEVENLABS_API_KEY is missing. Put it in .env');
  return k;
}

function post(pathname, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: pathname,
      method: 'POST',
      headers: {
        'xi-api-key': apiKey(),
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
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

function keyFor(text) {
  return crypto.createHash('md5').update(`${text}|${voiceId()}|${MODEL}|${LANGUAGE}`).digest('hex');
}

function durationOf(file, ffprobe) {
  const out = execFileSync(ffprobe || 'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  return parseFloat(out);
}

/*
 * Speak one line. Returns { file, duration, cached, characters }.
 * `characters` is 0 on a cache hit, which is how the run reports real spend.
 */
async function speak(text, { ffprobe } = {}) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('nothing to speak');
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const file = path.join(CACHE_DIR, `${keyFor(clean)}.mp3`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
    return { file, duration: durationOf(file, ffprobe), cached: true, characters: 0 };
  }

  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await post(
      `/v1/text-to-speech/${voiceId()}?output_format=${FORMAT}`,
      { text: clean, model_id: MODEL, language_code: LANGUAGE },
    );
    if (r.status === 200) {
      fs.writeFileSync(file, r.buf);
      return { file, duration: durationOf(file, ffprobe), cached: false, characters: clean.length };
    }
    last = `HTTP ${r.status}: ${r.buf.toString().slice(0, 200)}`;
    // 429 is the quota or rate limit; backing off helps the second, not the first
    if (r.status !== 429 && r.status < 500) break;
    await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
  }
  throw new Error(`ElevenLabs refused "${clean.slice(0, 30)}..." — ${last}`);
}

module.exports = { speak, CACHE_DIR, MODEL, DEFAULT_VOICE, voiceId };
