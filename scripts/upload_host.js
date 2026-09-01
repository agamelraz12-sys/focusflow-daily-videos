'use strict';
/*
 * upload_host.js — puts the finished MP4 somewhere Buffer can fetch it.
 *
 * The original skill used filebin.net and uguu.se: throwaway pastebins with a
 * few days of retention, a bad place to park a video Buffer only downloads
 * hours later. Instead the video goes to a GitHub Release on a repo she owns.
 *
 * The repo MUST be public — Buffer fetches the URL anonymously, so a private
 * release link 404s for it.
 */
const fs = require('fs');
const https = require('https');

const UA = 'focusflow-daily-videos';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describe(e) {
  if (!e) return 'unknown error';
  return e.message || e.code || String(e);
}

// Small JSON calls. Bodies here are tiny, so a single write is fine.
function api(method, host, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname: host,
      path: urlPath,
      method,
      headers: {
        'User-Agent': UA,
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(d); } catch (e) { /* not every reply is JSON */ }
        resolve({ status: res.statusCode, body: parsed, text: d });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/*
 * The asset upload, streamed from disk.
 *
 * This used to read the whole 25 to 40 MB file into memory and hand it to
 * req.write() in one call. Three of six uploads a night then died on
 * `write EPIPE`: one enormous write ignores backpressure, and when the far end
 * closes the socket partway through — which GitHub does — the write fails and
 * takes the whole cut with it. Piping a read stream lets Node manage the flow.
 */
function uploadAsset(host, urlPath, token, filePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size;
    const req = https.request({
      hostname: host,
      path: urlPath,
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'video/mp4',
        'Content-Length': size,
      },
      timeout: 300000,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(d); } catch (e) { /* not every reply is JSON */ }
        resolve({ status: res.statusCode, body: parsed, text: d });
      });
    });

    const stream = fs.createReadStream(filePath);
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      stream.destroy();
      req.destroy();
      reject(e);
    };

    req.on('error', fail);
    req.on('timeout', () => fail(new Error('upload timed out')));
    stream.on('error', fail);
    stream.pipe(req);
  });
}

async function ensureRelease(owner, repo, tag, token) {
  const found = await api('GET', 'api.github.com', `/repos/${owner}/${repo}/releases/tags/${tag}`, { token });
  if (found.status === 200) return found.body;
  if (found.status !== 404) throw new Error(`GitHub ${found.status} looking up release: ${found.text.slice(0, 200)}`);

  const made = await api('POST', 'api.github.com', `/repos/${owner}/${repo}/releases`, {
    token,
    body: { tag_name: tag, name: tag, body: 'Rendered videos awaiting publication.', draft: false, prerelease: false },
  });
  // Two cuts in one slot can race to create the day's release. Losing that race
  // is fine — the other one just made it.
  if (made.status === 422) {
    const again = await api('GET', 'api.github.com', `/repos/${owner}/${repo}/releases/tags/${tag}`, { token });
    if (again.status === 200) return again.body;
  }
  if (made.status !== 201) throw new Error(`GitHub ${made.status} creating release: ${made.text.slice(0, 200)}`);
  return made.body;
}

/*
 * On a runner the token arrives in the environment. On her machine it does not,
 * and rather than have her paste a personal access token into a file we borrow
 * the one the GitHub CLI is already holding.
 */
function localToken() {
  try {
    return require('child_process').execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

function head(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve(0);
    const req = https.request(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023', 'User-Agent': UA },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return head(res.headers.location, redirects + 1).then(resolve);
      }
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
    req.end();
  });
}

/*
 * A freshly uploaded release asset is not always downloadable the instant the
 * upload call returns. Two Instagram posts were once rejected with "Video could
 * not be read from its URL" while the TikTok cut from the same slot went
 * through. Do not hand Buffer a URL until it actually serves bytes.
 */
async function waitUntilReadable(url, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const status = await head(url);
    if (status === 200 || status === 206) return;
    await sleep(2000 * (i + 1));
  }
  throw new Error(`uploaded video is still not downloadable: ${url}`);
}

/*
 * `forDate` is the day the videos are scheduled for, and it groups a whole run
 * into one release. It used to come from "today in Israel" at the moment of
 * each upload, so a run crossing midnight split across two releases — and
 * deleting the one that looked superseded killed five live videos.
 */
async function publish(filePath, name, forDate) {
  const token = process.env.GITHUB_TOKEN || localToken();
  const slug = process.env.VIDEO_HOST_REPO;
  if (!token) throw new Error('No GitHub token. Either set GITHUB_TOKEN or run: gh auth login');
  if (!slug || !slug.includes('/')) throw new Error('VIDEO_HOST_REPO must look like "user/repo"');
  const [owner, repo] = slug.split('/');
  const tag = 'videos-' + (forDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }));

  /*
   * Retry the WHOLE sequence, not only the upload call.
   *
   * The previous version wrapped just the upload, so an EPIPE raised while
   * looking up or creating the release escaped untouched — and the log showed a
   * bare "write EPIPE" with no hint of which stage produced it, which is
   * exactly how three cuts were lost while a retry that looked correct sat
   * right there doing nothing. Every stage is named now.
   */
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    let stage = 'release lookup';
    try {
      const release = await ensureRelease(owner, repo, tag, token);

      stage = 'clearing a previous copy';
      const existing = (release.assets || []).find((a) => a.name === name);
      if (existing) {
        await api('DELETE', 'api.github.com', `/repos/${owner}/${repo}/releases/assets/${existing.id}`, { token });
      }

      stage = 'upload';
      const up = await uploadAsset('uploads.github.com',
        `/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        token, filePath);
      if (up.status !== 201) {
        const err = new Error(`GitHub ${up.status}: ${up.text.slice(0, 160)}`);
        err.permanent = up.status < 500 && up.status !== 429;
        throw err;
      }

      stage = 'waiting for the file to be served';
      await waitUntilReadable(up.body.browser_download_url);
      return up.body.browser_download_url;
    } catch (e) {
      last = new Error(`${stage} failed: ${describe(e)}`);
      if (e.permanent || attempt === 3) throw last;
      console.warn(`  ${last.message}, retrying in ${8 * (attempt + 1)}s`);
      await sleep(8000 * (attempt + 1));
    }
  }
  throw last;
}

module.exports = { publish };
