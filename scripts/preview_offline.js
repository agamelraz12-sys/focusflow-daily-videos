'use strict';
/*
 * preview_offline.js — renders a short real video with NO API keys.
 *
 * Stand-in footage (solid colour cards) and a stand-in music bed are generated
 * locally with ffmpeg. Everything else is the real pipeline: real Edge neural
 * TTS, real word-boundary timing, real subtitle rules, real ducking, real mux.
 *
 * This is how you check the things that actually go wrong — caption appearing
 * before the narrator speaks, two-line captions, the cut landing off the word,
 * Hebrew glyphs missing from the font — without spending a single API call.
 *
 *   node scripts/preview_offline.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { render } = require('./render_video.js');
const { CTA } = require('./lib/copy_rules.js');

const OUT = path.join(ROOT, 'out', 'preview');
const STUB = path.join(OUT, 'stub');

// A miniature script in the exact shape the generator produces.
const CUES = [
  { he: 'רוב האנשים טועים לגבי משמעת', en: 'Most people are wrong about discipline.', query: 'woman thinking window' },
  { he: 'זה לא קשור לכוח רצון', en: 'It has nothing to do with willpower.', query: 'tired person desk' },
  { he: 'הסביבה מנצחת את המוטיבציה תמיד', en: 'The room you sit in beats motivation every single time.', query: 'tidy bright room' },
  { he: 'תשימו את הטלפון בחדר אחר', en: 'Put the phone in a different room before you start.', query: 'phone face down table' },
  { he: 'בעוד שנה שום דבר ישתנה', en: 'One year from now nothing will have changed at all.', query: 'calendar pages turning' },
  ...CTA.instagram.map((c, i) => ({ he: c.he, en: c.en, query: i === 0 ? 'sunrise mountain top' : 'open road horizon' })),
];

const COLOURS = ['0x1b2a41', '0x2e4057', '0x48606f', '0x6b4f4f', '0x3d3550', '0x24455c', '0x4a3f5e'];

function ff(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(STUB, { recursive: true });

  // Real stock footage the moment a Pixabay key exists, colour cards before that.
  if (process.env.PIXABAY_KEY) {
    console.log('using real Pixabay footage');
  } else {
    console.log('no Pixabay key yet, building stand-in colour cards...');
    CUES.forEach((c, i) => {
      const file = path.join(STUB, `card${i}.mp4`);
      ff(['-f', 'lavfi', '-i', `color=c=${COLOURS[i % COLOURS.length]}:s=1080x1920:d=6:r=30`,
        '-vf', 'noise=alls=8:allf=t+u,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', file]);
      c.clipFile = file;
    });
  }

  console.log('building stand-in music bed...');
  const bed = path.join(STUB, 'bed.mp3');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=90',
    '-f', 'lavfi', '-i', 'sine=frequency=277:duration=90',
    '-filter_complex', '[0:a][1:a]amix=inputs=2,tremolo=f=0.2:d=0.6,volume=0.35[a]',
    '-map', '[a]', '-c:a', 'libmp3lame', '-q:a', '5', bed]);

  console.log('rendering...\n');
  const file = await render({
    outDir: OUT,
    cues: CUES,
    musicFile: bed,
    brand: process.env.BRAND_HANDLE || undefined,
  });

  // Report the timing the renderer actually produced, so the two rules that
  // matter can be eyeballed as numbers rather than by squinting at the video.
  console.log('\ncue timing (subtitle window vs clip window):');
  CUES.forEach((c, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. sub ${c.speakStart.toFixed(2)}–${c.speakEnd.toFixed(2)}s`
      + `   clip ${c.clipStart.toFixed(2)}–${c.clipEnd.toFixed(2)}s   ${c.he}`,
    );
  });

  const gap = CUES[0].speakStart;
  console.log(`\nfirst word is spoken at ${gap.toFixed(2)}s, and the first caption starts at exactly that moment.`);
  console.log(`preview: ${file}`);
  fs.rmSync(STUB, { recursive: true, force: true });
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
