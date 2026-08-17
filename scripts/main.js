'use strict';
/*
 * main.js — one run produces a full day of content.
 *
 * For each of the six slots it writes a brand new script, renders two cuts of
 * it (Instagram asks for a comment, TikTok and YouTube send people to the
 * profile link), uploads them, and books all three channels in Buffer.
 *
 * A failure on one slot does not take down the rest of the day.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require('./lib/net.js');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { writeScript, toCues, loadLedger, saveLedger, remember } = require('./generate_content.js');
const { render, coverOffsetMs } = require('./render_video.js');
const music = require('./music.js');
const { publish } = require('./upload_host.js');
const { schedule, gql } = require('./schedule_buffer.js');

const STATE_PATH = path.join(ROOT, 'state.json');
const OUT_DIR = path.join(ROOT, 'out');

// Six a day, first thing in the morning through late evening, a few hours apart.
const SLOTS = ['07:45', '10:30', '13:15', '16:00', '18:45', '22:00'];

const BRAND = process.env.BRAND_HANDLE || '';
const PROFILE_LINK = process.env.PROFILE_LINK || '';

// --------------------------------------------------------------- time ------

function tzOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}

// "2026-08-08" + "07:45" in Israel -> UTC ISO string, DST safe.
function israelToUTC(dateStr, hhmm) {
  const naive = new Date(`${dateStr}T${hhmm}:00Z`);
  let off = tzOffsetMinutes('Asia/Jerusalem', naive);
  let utc = new Date(naive.getTime() - off * 60000);
  const off2 = tzOffsetMinutes('Asia/Jerusalem', utc);
  if (off2 !== off) utc = new Date(naive.getTime() - off2 * 60000);
  return utc.toISOString();
}

function israelToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/*
 * Buffer rejects a dueAt in the past, so if today's first slot has already gone
 * by we book the whole day for tomorrow instead of dropping slots.
 */
function targetDate() {
  if (process.env.TARGET_DATE) return process.env.TARGET_DATE;
  const today = israelToday();
  const firstSlot = new Date(israelToUTC(today, SLOTS[0])).getTime();
  return Date.now() < firstSlot - 20 * 60 * 1000 ? today : addDays(today, 1);
}

// ------------------------------------------------------ already booked? ----

/*
 * Ask Buffer what is already on the calendar for this day.
 *
 * This is the guard that actually holds. The old one trusted state.json, which
 * the workflow committed back to the repo — except the commit step ran
 * `git add` over a file that no longer existed, so it staged nothing, silently,
 * every night. state.json sat frozen on one date for eight days, the "already
 * scheduled" check never fired, both nightly crons did a full run, and every
 * slot went out twice. Buffer is the only source of truth about what Buffer
 * holds, so ask Buffer.
 */
async function alreadyBooked(dateStr) {
  const organizationId = process.env.BUFFER_ORG_ID;
  if (!organizationId) return new Set();

  const taken = new Set();
  /*
   * Paginate. Buffer returns TEN posts by default, and a guard that sees ten of
   * a hundred posts is not a guard — it would wave through most of the day as
   * unbooked and duplicate it all over again. This trap has now bitten twice.
   */
  const QUERY = `query Booked($input: PostsInput!, $first: Int!, $after: String) {
    posts(input: $input, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { dueAt channelService } }
    }
  }`;

  let after = null;
  for (let page = 0; page < 20; page++) {
    let conn;
    let lastErr;
    // A dropped connection here must not be shrugged off. An empty set reads as
    // "nothing is booked", which is the exact input that duplicates a whole day.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const data = await gql(QUERY, {
          input: { organizationId, filter: { status: ['scheduled', 'sent'] } },
          first: 100,
          after,
        });
        conn = data.posts;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      }
    }
    if (!conn) {
      throw new Error(`could not read the existing calendar: ${lastErr && lastErr.message}`);
    }
    for (const edge of conn.edges || []) {
      const n = edge.node;
      if (!n?.dueAt) continue;
      // Compare on the exact instant a slot maps to, so only a true repeat matches.
      taken.add(`${new Date(n.dueAt).toISOString()}|${n.channelService}`);
    }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return taken;
}

// ------------------------------------------------------------- captions ----

function captionFor(platform, draft) {
  // No music credit line any more. It existed for Jamendo's CC BY tracks, which
  // legally required naming the artist in every caption. The beds are composed
  // now, so there is nobody to credit and the line was only taking up the space
  // where the call to action should be.
  const credit = '';
  if (platform === 'instagram') {
    return `${draft.caption}\n\nתגיבו "אני" וקבלו 7 ימי ניסיון בחינם באפליקציה 👇${credit}`;
  }
  const link = PROFILE_LINK ? `\n${PROFILE_LINK}` : '';
  return `${draft.caption}\n\n7 ימי ניסיון בחינם באפליקציה, הקישור בפרופיל 👇${link}${credit}`;
}

// ------------------------------------------------------------------ run ----

async function doSlot(i, dateStr, ledger, tracks, booked) {
  const slot = SLOTS[i];
  const dueAt = israelToUTC(dateStr, slot);
  const stamp = new Date(dueAt).toISOString();

  // Nothing to do if all three channels already hold this slot. Checked before
  // a single frame is rendered, because rendering it and then discovering the
  // duplicate is fifty minutes wasted.
  const wanted = ['instagram', 'tiktok', 'youtube'].filter((p) => process.env[`BUFFER_CHANNEL_${p.toUpperCase()}`]);
  if (wanted.every((p) => booked.has(`${stamp}|${p}`))) {
    console.log(`\n[${i + 1}/${SLOTS.length}] slot ${slot} already booked on every channel, skipping`);
    return [];
  }

  console.log(`\n[${i + 1}/${SLOTS.length}] slot ${slot} Israel (${dueAt})`);

  console.log('  writing a new script...');
  const draft = await writeScript({ ledger });
  console.log(`  ${draft.motivator} · ${draft.idea}`);
  console.log(`  breaking: ${draft.limitingBelief}`);

  const bed = music.pick(tracks, i);

  // Instagram cut and the shared TikTok/YouTube cut. Same body, different close.
  const cuts = [
    { key: 'instagram', platforms: ['instagram'], cues: toCues(draft, 'instagram') },
    { key: 'link', platforms: ['tiktok', 'youtube'], cues: toCues(draft, 'tiktok') },
  ];

  const results = [];
  for (const cut of cuts) {
    const dir = path.join(OUT_DIR, `slot${i}_${cut.key}`);
    fs.mkdirSync(dir, { recursive: true });

    // One cut blowing up must not discard the cut that already succeeded. The
    // first live run lost a scheduled Instagram post this way.
    let file, url, coverMs;
    try {
      console.log(`  rendering ${cut.key} cut...`);
      file = await render({
        outDir: dir,
        cues: cut.cues,
        musicFile: bed.path,
        brand: BRAND || undefined,
      });
      // Which frame the profile grid should show. Read it now: `dir` is deleted
      // at the end of the cut, and the sidecar goes with it.
      coverMs = coverOffsetMs(file);
      console.log('  uploading...');
      // Tag the release by the day being scheduled, not by the wall clock, so
      // a run that crosses midnight still lands in a single release.
      url = await publish(file, `${dateStr}_slot${i}_${cut.key}.mp4`, dateStr);
    } catch (e) {
      console.error(`  ✗ ${cut.key} cut failed: ${e.message}`);
      results.push({ platform: cut.platforms.join('+'), ok: false, error: e.message });
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }

    for (const platform of cut.platforms) {
      const channelId = process.env[`BUFFER_CHANNEL_${platform.toUpperCase()}`];
      if (!channelId) { console.warn(`  no channel id for ${platform}, skipping`); continue; }
      if (booked.has(`${stamp}|${platform}`)) {
        console.log(`  - ${platform} already has this slot, not posting twice`);
        continue;
      }
      try {
        const post = await schedule({
          platform,
          channelId,
          videoUrl: url,
          thumbnailOffsetMs: coverMs,
          caption: captionFor(platform, draft),
          title: draft.title,
          // No first comment: it was echoing the caption back verbatim, which
          // reads as a bot. Hashtags could live here later if wanted.
          dueAt,
        });
        console.log(`  ✓ ${platform} scheduled (post ${post.id})`);
        results.push({ platform, ok: true, id: post.id });
      } catch (e) {
        console.error(`  ✗ ${platform} failed: ${e.message}`);
        results.push({ platform, ok: false, error: e.message });
      }
    }

    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Only burn the script if something actually got scheduled. A run that fails
  // outright must leave the queue exactly as it found it, or the work is gone.
  if (results.some((r) => r.ok)) remember(ledger, draft);
  else console.warn('  nothing scheduled for this slot, keeping the script in the queue');

  return results;
}

async function main() {
  const force = process.env.FORCE_RUN === 'true';
  const state = fs.existsSync(STATE_PATH)
    ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
    : { lastRunDate: '' };

  const dateStr = targetDate();
  if (!force && state.lastRunDate === dateStr) {
    console.log(`Already scheduled ${dateStr}. Nothing to do.`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`=== scheduling ${SLOTS.length} videos for ${dateStr} ===`);

  /*
   * If the calendar cannot be read, stop. Missing a day is recoverable with one
   * manual run; posting a day twice to a real audience is not.
   */
  let booked;
  try {
    booked = await alreadyBooked(dateStr);
  } catch (e) {
    console.error(`Refusing to schedule blind: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const slotStamps = SLOTS.map((s) => new Date(israelToUTC(dateStr, s)).toISOString());
  const channels = ['instagram', 'tiktok', 'youtube'].filter((p) => process.env[`BUFFER_CHANNEL_${p.toUpperCase()}`]);
  const missing = slotStamps.reduce((n, st) => n + channels.filter((p) => !booked.has(`${st}|${p}`)).length, 0);
  if (missing === 0) {
    console.log(`${dateStr} is already fully booked on every channel. Nothing to do.`);
    return;
  }
  if (booked.size) console.log(`${missing} post(s) still missing for ${dateStr}`);

  console.log('stocking music...');
  const tracks = await music.stock(12);

  const ledger = loadLedger();
  const summary = [];

  // Without a Gemini key the only content is whatever sits in the queue, so
  // schedule what exists and stop cleanly rather than failing six times over.
  const limit = Math.min(SLOTS.length, Number(process.env.SLOT_LIMIT) || SLOTS.length);
  // SLOT_START lets a partially finished day be topped up without re-posting
  // the slots that already went through.
  const start = Math.max(0, Number(process.env.SLOT_START) || 0);
  if (start > 0 || limit < SLOTS.length) console.log(`(slots ${start + 1} to ${limit})`);

  for (let i = start; i < limit; i++) {
    try {
      summary.push(...await doSlot(i, dateStr, ledger, tracks, booked));
    } catch (e) {
      if (/GEMINI_API_KEY is missing/.test(e.message)) {
        console.log(`\nOut of scripts after ${i} slot(s): the queue is empty and there is no Gemini key.`);
        break;
      }
      console.error(`[${i + 1}] slot failed: ${e.message}`);
      summary.push({ platform: 'slot' + i, ok: false, error: e.message });
    }
    saveLedger(ledger); // checkpoint after every slot so a crash never repeats work
  }

  state.lastRunDate = dateStr;
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');

  const ok = summary.filter((s) => s.ok).length;
  console.log(`\n=== ${ok}/${summary.length} posts scheduled for ${dateStr} ===`);
  if (ok === 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
}

module.exports = { israelToUTC, targetDate, SLOTS, alreadyBooked };
