'use strict';
/*
 * preview_real.js — renders the next script in the queue for real, and stops.
 *
 * Same pipeline as a live run: real footage, real music bed, real narration,
 * real subtitle rules. It just does not upload and does not schedule, so it is
 * safe to run as many times as you like before anything goes public.
 *
 *   node scripts/preview_real.js [instagram|tiktok]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { toCues } = require('./generate_content.js');
const { render } = require('./render_video.js');
const music = require('./music.js');

const platform = process.argv[2] || 'instagram';
const OUT = path.join(ROOT, 'out', 'preview-real');

(async () => {
  const queue = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'queue.json'), 'utf8'));
  if (!queue.length) throw new Error('the queue is empty, nothing to preview');
  const draft = queue[0]; // peek, never consume — this is a preview

  console.log(`script: ${draft.idea}`);
  console.log(`breaking: ${draft.limitingBelief}`);
  console.log(`installing: ${draft.empoweringBelief}\n`);

  const tracks = await music.stock(3);
  const bed = music.pick(tracks, 0);
  console.log(`music: ${bed.track.name}\n`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const cues = toCues(draft, platform);
  const file = await render({
    outDir: OUT,
    cues,
    musicFile: bed.path,
    brand: process.env.BRAND_HANDLE || undefined,
  });

  const early = cues.filter((c, i) => i > 0 && c.speakStart < cues[i - 1].speakEnd);
  console.log(`\n${cues.length} cues, ${early.length} overlapping captions (must be 0)`);

  // Print a timestamp in the middle of a few caption windows, so frames can be
  // sampled where text is actually on screen instead of guessing.
  const samples = [2, Math.floor(cues.length / 2), cues.length - 1];
  console.log('sample these timestamps to see captions:');
  samples.forEach((i) => {
    const c = cues[i];
    console.log(`  ${(((c.speakStart + c.speakEnd) / 2)).toFixed(2)}s  ->  ${c.he}`);
  });
  console.log(`\npreview: ${file}`);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
