'use strict';
/*
 * upload_host.js — puts the finished MP4 somewhere Buffer can fetch it.
 *
 * The original skill used filebin.net and uguu.se. Both are throwaway pastebins
 * with 2 to 6 day retention and no uptime promise, which is a bad place to park
 * a video that Buffer will only download hours later. Instead we upload to a
 * GitHub Release in a repo the founder owns: free, permanent, and fast.
 *
 * The host repo MUST be public — Buffer fetches the URL anonymously, so a
 * private repo's download link would 404 for it.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const UA = 'focusflow-daily-videos';

function api(method, host, urlPath, { token, body, contentType, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw || (body ? Buffer.from(JSON.stringify(body)) : null);
    const req = https.request({
      hostname: host,
      path: urlPath,
      method,
      headers: {
        'User-Agent': UA,
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(payload ? { 'Content-Type': contentType || 'application/json', 'Content-Length': payload.length } : {}),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, body: parsed, text: d });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
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
  if (made.status !== 201) throw new Error(`GitHub ${made.status} creating release: ${made.text.slice(0, 200)}`);
  return made.body;
}

/*
 * Upload and return a public direct URL. Re-uploading the same name replaces the
 * old asset, so a re-run of the same day is safe.
 */
/*
 * On a runner the token arrives in the environment. On the founder's machine it
 * does not, and rather than have her paste a personal access token into a file
 * we borrow the one the GitHub CLI is already holding.
 */
function localToken() {
  try {
    return require('child_process').execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

/*
 * `forDate` is the day the videos are scheduled for, and it groups a whole run
 * into one release.
 *
 * It used to derive the tag from "today in Israel" at the moment of each
 * upload. A run that crossed midnight then split its videos across two
 * releases, which made one of them look superseded and safe to delete. It was
 * not: deleting it killed five live videos. The target date does not move
 * mid-run, so it cannot do that.
 */
async function publish(filePath, name, forDate) {
  const token = process.env.GITHUB_TOKEN || localToken();
  const slug = process.env.VIDEO_HOST_REPO;
  if (!token) throw new Error('No GitHub token. Either set GITHUB_TOKEN or run: gh auth login');
  if (!slug || !slug.includes('/')) throw new Error('VIDEO_HOST_REPO must look like "user/repo"');
  const [owner, repo] = slug.split('/');

  const tag = 'videos-' + (forDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }));
  const release = await ensureRelease(owner, repo, tag, token);

  const existing = (release.assets || []).find((a) => a.name === name);
  if (existing) {
    await api('DELETE', 'api.github.com', `/repos/${owner}/${repo}/releases/assets/${existing.id}`, { token });
  }

  const data = fs.readFileSync(filePath);
  const up = await api('POST', 'uploads.github.com',
    `/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    { token, raw: data, contentType: 'video/mp4' });
  if (up.status !== 201) throw new Error(`GitHub ${up.status} uploading asset: ${up.text.slice(0, 200)}`);

  const url = up.body.browser_download_url;
  await waitUntilReadable(url);
  return url;
}

/*
 * A freshly uploaded release asset is not always downloadable the instant the
 * upload call returns. Two Instagram posts were rejected with "Video could not
 * be read from its URL" while the TikTok cut from the same slot went through,
 * which is the signature of a race rather than a bad file. So do not hand
 * Buffer a URL until it actually serves the bytes.
 */
function head(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve(0);
    const req = https.request(url, { method: 'GET', headers: { Range: 'bytes=0-1023', 'User-Agent': UA }, timeout: 30000 }, (res) => {
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

async function waitUntilReadable(url, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const status = await head(url);
    if (status === 200 || status === 206) return;
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`uploaded video is still not downloadable: ${url}`);
}

module.exports = { publish };
