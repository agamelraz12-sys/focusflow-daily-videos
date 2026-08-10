'use strict';
/*
 * doctor.js — checks every moving part before a real run.
 * Run this after any key change: node scripts/doctor.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
require('./lib/net.js');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const results = [];
const ok = (name, detail) => results.push({ name, ok: true, detail });
const bad = (name, detail) => results.push({ name, ok: false, detail });
// Something that degrades the result but must not stop a run. The workflow
// calls this as a gate, so a missing nice-to-have cannot be allowed to fail it.
const warn = (name, detail) => results.push({ name, warn: true, detail });

function get(url, headers) {
  return new Promise((resolve) => {
    https.get(url, { headers: headers || {} }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', (e) => resolve({ status: 0, body: e.message }));
  });
}

function post(host, urlPath, headers, body) {
  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: host, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, ...headers },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.write(payload);
    req.end();
  });
}

(async () => {
  // ffmpeg
  try {
    const v = execFileSync('ffmpeg', ['-version']).toString().split('\n')[0];
    ok('ffmpeg', v.slice(0, 60));
  } catch (e) {
    bad('ffmpeg', 'not on PATH — winget install Gyan.FFmpeg (Windows) / apt install ffmpeg (Linux)');
  }

  // Pixabay
  if (!process.env.PIXABAY_KEY) bad('Pixabay', 'PIXABAY_KEY missing from .env');
  else {
    const r = await get(`https://pixabay.com/api/videos/?key=${process.env.PIXABAY_KEY}&q=morning+routine&per_page=3`);
    if (r.status === 200) {
      let n = 0;
      try { n = (JSON.parse(r.body).hits || []).length; } catch (e) {}
      n ? ok('Pixabay', `${n} clips returned`) : bad('Pixabay', 'key works but no results');
    } else bad('Pixabay', `HTTP ${r.status} — ${r.body.slice(0, 80)}`);
  }

  // Jamendo
  if (!process.env.JAMENDO_CLIENT_ID) warn('Jamendo', 'no key — falling back to locally synthesised music beds');
  else {
    const r = await get(`https://api.jamendo.com/v3.0/tracks/?client_id=${process.env.JAMENDO_CLIENT_ID}`
      + '&format=json&limit=5&fuzzytags=ambient+calm&vocalinstrumental=instrumental');
    let hits = [];
    try { hits = JSON.parse(r.body).results || []; } catch (e) {}
    if (r.status === 200 && hits.length) {
      const usable = hits.filter((t) => /\/(by|by-sa)\//.test(t.license_ccurl || '') && !/-nc/.test(t.license_ccurl || ''));
      ok('Jamendo', `${hits.length} tracks, ${usable.length} usable commercially`);
    } else bad('Jamendo', `HTTP ${r.status} — ${r.body.slice(0, 100)}`);
  }

  // Gemini. Only actually required when the hand written queue has run dry —
  // a full queue is perfectly valid content for a run.
  let queued = 0;
  try { queued = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'queue.json'), 'utf8')).length; } catch (e) {}
  if (!process.env.GEMINI_API_KEY && queued > 0) {
    warn('Gemini', `no key, but ${queued} script(s) are queued — enough for ${queued} more slot(s)`);
  } else if (!process.env.GEMINI_API_KEY) {
    bad('Gemini', 'GEMINI_API_KEY missing and the script queue is empty — aistudio.google.com/apikey');
  } else {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    // A 503 here means "overloaded right now", not "broken". Failing the
    // preflight on it threw away a whole night's run, so try a few times and
    // then downgrade to a warning rather than blocking: the writer retries too.
    let r;
    for (let i = 0; i < 3; i++) {
      r = await post('generativelanguage.googleapis.com', `/v1beta/models/${model}:generateContent`,
        { 'x-goog-api-key': process.env.GEMINI_API_KEY },
        { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }] });
      if (r.status === 200 || r.status < 500) break;
      await new Promise((res) => setTimeout(res, 5000 * (i + 1)));
    }
    if (r.status === 200) ok('Gemini', `${model} responding`);
    else if (r.status >= 500) warn('Gemini', `${model} overloaded (HTTP ${r.status}) — the writer will retry`);
    else bad('Gemini', `HTTP ${r.status} on ${model} — ${r.body.slice(0, 140)}`);
  }

  // Narration. Microsoft's he-IL voices are native Hebrew and free; ElevenLabs
  // has no Hebrew voice at all, only English ones bending towards it.
  const { provider, edgeVoice } = require('./tts.js');
  if (provider() === 'edge') {
    ok('Narration', `Microsoft ${edgeVoice()} (native Hebrew, free)`);
  } else if (!process.env.ELEVENLABS_API_KEY) {
    bad('Narration', 'TTS_PROVIDER is elevenlabs but ELEVENLABS_API_KEY is missing');
  } else {
    warn('Narration', 'ElevenLabs has no Hebrew voice — it reads Hebrew with an English accent');
  }
  {
    const cache = path.join(ROOT, 'assets', 'voice-cache');
    const n = fs.existsSync(cache) ? fs.readdirSync(cache).filter((f) => f.endsWith('.mp3')).length : 0;
    ok('  voice cache', `${n} lines ready`);
  }

  // ElevenLabs is still needed — it composes the background music.
  if (!process.env.ELEVENLABS_API_KEY) bad('Music', 'ELEVENLABS_API_KEY missing — beds cannot be composed');
  else {
    const dir = path.join(ROOT, 'assets', 'music');
    const beds = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).length : 0;
    const r = await get('https://api.elevenlabs.io/v1/models', { 'xi-api-key': process.env.ELEVENLABS_API_KEY });
    if (r.status === 200) ok('Music', `ElevenLabs reachable · ${beds} bed(s) cached`);
    else if (beds) warn('Music', `ElevenLabs HTTP ${r.status}, but ${beds} bed(s) are already cached`);
    else bad('Music', `ElevenLabs HTTP ${r.status} and no cached beds — ${r.body.slice(0, 100)}`);
  }

  // Buffer + channels
  if (!process.env.BUFFER_ACCESS_TOKEN) bad('Buffer', 'BUFFER_ACCESS_TOKEN missing');
  else {
    const r = await post('api.buffer.com', '/', { Authorization: `Bearer ${process.env.BUFFER_ACCESS_TOKEN}` },
      { query: 'query { account { id email organizations { id name } } }' });
    let acct = null;
    try { acct = JSON.parse(r.body).data?.account; } catch (e) {}
    if (acct) {
      ok('Buffer', `${acct.email} · org ${acct.organizations?.[0]?.id}`);
      for (const p of ['INSTAGRAM', 'TIKTOK', 'YOUTUBE']) {
        const id = process.env[`BUFFER_CHANNEL_${p}`];
        id ? ok(`  channel ${p.toLowerCase()}`, id) : bad(`  channel ${p.toLowerCase()}`, `BUFFER_CHANNEL_${p} missing`);
      }
    } else bad('Buffer', `HTTP ${r.status} — ${r.body.slice(0, 140)}`);
  }

  // GitHub video host
  const slug = process.env.VIDEO_HOST_REPO;
  let ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    try { ghToken = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch (e) {}
  }
  if (!slug || !ghToken) bad('Video host', 'VIDEO_HOST_REPO missing, or no GitHub token (run: gh auth login)');
  else {
    const r = await get(`https://api.github.com/repos/${slug}`, {
      'User-Agent': 'focusflow-doctor',
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
    });
    let repo = null;
    try { repo = JSON.parse(r.body); } catch (e) {}
    if (r.status === 200 && repo) {
      /*
       * Public is the hard requirement: Buffer fetches the MP4 anonymously, so
       * a private release URL 404s for it.
       *
       * Write access is NOT asserted from `permissions.push`. The token Actions
       * hands the job is an installation token; it can create releases under
       * `permissions: contents: write`, but the repo endpoint does not report
       * `push: true` for it. Failing on that field blocked a run that would
       * have worked perfectly. If writing really is impossible, the upload says
       * so with a precise error a few seconds later.
       */
      if (repo.private) bad('Video host', `${slug} is PRIVATE — Buffer cannot download from it, make it public`);
      else if (repo.permissions?.push) ok('Video host', `${slug} public and writable`);
      else ok('Video host', `${slug} public (write proven at upload, not here)`);
    } else bad('Video host', `HTTP ${r.status} for ${slug}`);
  }

  console.log('');
  for (const r of results) {
    const mark = r.ok ? '✓' : r.warn ? '!' : '✗';
    console.log(`${mark} ${r.name.padEnd(22)} ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok && !r.warn);
  const warned = results.filter((r) => r.warn);
  console.log('');
  if (failed.length) {
    console.log(`${failed.length} thing(s) must be fixed before a run can work.`);
    process.exitCode = 1;
  } else if (warned.length) {
    console.log(`Ready to run, with ${warned.length} thing(s) running on a fallback.`);
  } else {
    console.log('Everything checks out. Ready to run.');
  }
})();
