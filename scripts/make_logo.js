'use strict';
/*
 * make_logo.js — the FOCUS badge that sits at the bottom of every video.
 *
 * A black disc, a large white F, and FOCUS letter-spaced underneath.
 *
 * It is drawn here rather than loaded from a file on purpose. The founder sent
 * the logo as a picture in chat, and rebuilding it means it is crisp at any
 * size and the renderer never depends on an asset that might go missing. It
 * also replaced an earlier attempt that used the FocusFlow app icon, which was
 * the wrong mark entirely.
 *
 * Drop a real `assets/brand/focus_badge.png` in and that wins instead.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BRAND_DIR = path.join(ROOT, 'assets', 'brand');
const BADGE = path.join(BRAND_DIR, 'focus_badge.png');

const SIZE = 512;                 // drawn big, scaled down at render time
const R = Math.round(SIZE * 0.49);
const CX = SIZE / 2;
const CY = SIZE / 2;

function ffmpeg(args) {
  return execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function findFont() {
  const bundled = path.join(ROOT, 'assets', 'fonts');
  if (fs.existsSync(bundled)) {
    const f = fs.readdirSync(bundled).find((x) => /bold/i.test(x) && /\.ttf$/i.test(x))
      || fs.readdirSync(bundled).find((x) => /\.ttf$/i.test(x));
    if (f) return path.join(bundled, f);
  }
  for (const p of [
    'C:/Windows/Fonts/arialbd.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansHebrew-Bold.ttf',
  ]) if (fs.existsSync(p)) return p;
  return null;
}

const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

/*
 * Returns the badge path, drawing it once if needed.
 */
function ensureLockup() {
  if (fs.existsSync(BADGE) && fs.statSync(BADGE).size > 2000) return BADGE;
  fs.mkdirSync(BRAND_DIR, { recursive: true });

  const font = findFont();
  if (!font) return null;

  /*
   * The disc is painted through the alpha channel with geq rather than drawn as
   * a shape, because ffmpeg has no circle primitive. Everything downstream is
   * kept in rgba and the file is written with an explicit alpha pixel format —
   * the first version skipped that and encoded an opaque black rectangle, which
   * showed up in the video as a black sticker.
   */
  const disc = `color=black@1.0:s=${SIZE}x${SIZE}:r=1`;
  const circleAlpha = `format=rgba,geq=r='0':g='0':b='0':a='if(lte(hypot(X-${CX},Y-${CY}),${R}),255,0)'`;

  const fMark = `drawtext=fontfile='${esc(font)}':text='F':fontcolor=white:`
    + `fontsize=${Math.round(SIZE * 0.52)}:x=(w-text_w)/2:y=${Math.round(SIZE * 0.20)}`;

  // Wide tracking, done with real spaces because drawtext has no letter-spacing.
  const wordmark = `drawtext=fontfile='${esc(font)}':text='F O C U S':fontcolor=white:`
    + `fontsize=${Math.round(SIZE * 0.085)}:x=(w-text_w)/2:y=${Math.round(SIZE * 0.70)}`;

  ffmpeg([
    '-f', 'lavfi', '-i', disc,
    '-vf', `${circleAlpha},${fMark},${wordmark},format=rgba`,
    '-frames:v', '1', '-pix_fmt', 'rgba', BADGE,
  ]);

  return BADGE;
}

module.exports = { ensureLockup, LOCKUP: BADGE };

if (require.main === module) {
  const p = ensureLockup();
  console.log(p ? `badge ready: ${p}` : 'no usable font found, badge not drawn');
}
