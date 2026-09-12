'use strict';
/*
 * brand_bg.js — the background every cue sits on.
 *
 * This replaced stock footage on 2026-09-12, and the reason was the grid rather
 * than the video. Each reel used to pull a Pixabay clip per line, which meant
 * the profile grid was a wall of unrelated strangers: a man's face, someone's
 * legs, a field of grass, none of it connected to the account or to each other.
 * Next to the five posts the founder had designed by hand it read like a
 * different account, and those five were the only ones that looked like פוקוס.
 *
 * So the footage is generated instead, in the app's own visual language: the
 * near-black stage from DESIGN.md with the single magenta to violet orb that is
 * the one glow the product allows itself. Every tile in the grid becomes a dark
 * branded card with one readable Hebrew line on it.
 *
 * It also removes Pixabay from the render path, and with it the rate limit, the
 * IPv6 stalls and the download retries that cost the first live runs so much.
 *
 * The orb is a still PNG that is moved, scaled and faded by ffmpeg rather than
 * being redrawn per frame. Redrawing a 1080x1920 radial gradient with geq for
 * every frame of every cue is minutes of CPU per video for a result nobody can
 * tell apart from this.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ORB = path.join(ROOT, 'assets', 'brand', 'orb.png');

// From focusflow/DESIGN.md. `bg` is deliberately not pure black.
const BG = '0x08070C';
const ORB_FROM = [226, 74, 153];   // #E24A99
const ORB_TO = [124, 77, 255];     // #7C4DFF
const ORB_PX = 1400;

/*
 * Build the orb once. It is a radial fill that runs magenta in the middle to
 * violet at the rim, with alpha falling off as a soft power curve so there is
 * no visible edge where it meets the background. Exponent 2.2 was chosen by
 * eye: 1.0 leaves a discernible disc, 4.0 shrinks the glow to a dot.
 */
function ensureOrb(ffmpeg) {
  if (fs.existsSync(ORB) && fs.statSync(ORB).size > 1024) return ORB;
  fs.mkdirSync(path.dirname(ORB), { recursive: true });
  const c = ORB_PX / 2;
  const d = `min(1,hypot(X-${c},Y-${c})/${c})`;
  const chan = (i) => `${ORB_FROM[i]}+(${ORB_TO[i]}-${ORB_FROM[i]})*${d}`;
  const alpha = `255*pow(max(0,1-hypot(X-${c},Y-${c})/${c}),2.2)`;
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=black:s=${ORB_PX}x${ORB_PX}`,
    '-vf', `format=rgba,geq=r='${chan(0)}':g='${chan(1)}':b='${chan(2)}':a='${alpha}'`,
    '-frames:v', '1', ORB], { stdio: ['ignore', 'ignore', 'pipe'] });
  return ORB;
}

/*
 * Where the orb sits for a given cue, and how big.
 *
 * Two things are being balanced. The orb has to move between cues so a cut is
 * felt even though the background never changes character, and it has to stay
 * away from the middle of the frame, because the caption is pinned dead centre
 * at \pos(540,960) and text over the bright core of the glow loses contrast.
 *
 * Positions are therefore taken from a fixed ring of placements rather than
 * from a random number, so a rerun of the same video is identical and no two
 * neighbouring cues ever land in the same spot.
 */
const PLACEMENTS = [
  { x: 0.18, y: 0.22, s: 1.00 },
  { x: 0.84, y: 0.30, s: 0.86 },
  { x: 0.26, y: 0.80, s: 0.94 },
  { x: 0.78, y: 0.74, s: 1.06 },
  { x: 0.12, y: 0.55, s: 0.80 },
  { x: 0.90, y: 0.52, s: 0.98 },
  { x: 0.50, y: 0.14, s: 0.90 },
  { x: 0.50, y: 0.88, s: 1.02 },
];

// One hash per video, reused for both the placement ring and the hue.
function seedNum(seed) {
  if (!seed) return 0;
  return parseInt(crypto.createHash('md5').update(String(seed)).digest('hex').slice(0, 6), 16);
}

function placementFor(index, seed) {
  // The seed rotates the ring per video so two videos rendered the same day do
  // not open on an identical frame.
  return PLACEMENTS[(index + seedNum(seed)) % PLACEMENTS.length];
}

/*
 * How far to rotate the orb's hue, per video.
 *
 * Without this every tile in the profile grid is the same magenta and a page of
 * them reads as one long smear. With it the grid keeps a rhythm of colour while
 * staying obviously one family.
 *
 * The rotation only ever goes one way, and the sign is counter-intuitive.
 * The brand runs magenta #E24A99 to violet #7C4DFF, and in ffmpeg's hue filter
 * it is NEGATIVE degrees that walk magenta towards violet; positive degrees go
 * the other way and land on a coral that belongs to a different company. Both
 * mistakes were made in turn, so the sign here is confirmed by eye and not by
 * reasoning about colour wheels.
 *
 * It is keyed to the video, not the cue, so a single reel never shifts colour
 * while someone is watching it.
 */
function hueShiftFor(seed) {
  if (!seed) return 0;
  return -(seedNum(seed) % 35);
}

/*
 * Render one cue's background.
 *
 * The orb drifts a little over the life of the shot and breathes in scale. Both
 * are slow on purpose: this sits behind text that people are reading, and a
 * background that competes with the caption is worse than no background.
 *
 * `noise` puts a light grain over the whole frame. Without it a near-black
 * gradient bands badly once Instagram re-encodes it, in visible steps across
 * the falloff.
 */
function renderBackground(ffmpeg, { index, seconds, outFile, width, height, seed, fps = 30 }) {
  ensureOrb(ffmpeg);
  const p = placementFor(index, seed);
  const size = Math.round(width * 1.9 * p.s);
  const cx = Math.round(width * p.x), cy = Math.round(height * p.y);

  // Drift is expressed against `t` so it is independent of frame rate. 26px
  // over a four second shot is movement you feel without being able to watch it.
  const dir = index % 2 === 0 ? 1 : -1;
  const driftX = `${dir * 26}*t/${Math.max(0.8, seconds).toFixed(2)}`;
  const driftY = `${-dir * 18}*t/${Math.max(0.8, seconds).toFixed(2)}`;
  const breathe = `1+0.035*sin(2*PI*t/7)`;

  const hue = hueShiftFor(seed);
  // hue= on rgba drops the alpha channel, so the orb is split: the colour is
  // rotated on its own and the original alpha is pasted back with alphamerge.
  const tint = hue
    ? `split[hc][ha];[hc]hue=h=${hue}[hr];[ha]alphaextract[am];[hr][am]alphamerge,`
    : '';

  const filter = [
    `[1:v]scale=${size}:${size},format=rgba,${tint}` +
      `scale=w='iw*(${breathe})':h='ih*(${breathe})':eval=frame[orb]`,
    `[0:v][orb]overlay=` +
      `x='${cx}-overlay_w/2+(${driftX})':` +
      `y='${cy}-overlay_h/2+(${driftY})':` +
      `eval=frame:format=auto[lit]`,
    `[lit]noise=alls=7:allf=t+u,setsar=1,format=yuv420p[v]`,
  ].join(';');

  // These encoder settings deliberately match the stock-footage path in
  // render_video.js. The segments are stitched with `concat -c copy`, which
  // refuses to join streams whose parameters differ.
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${BG}:s=${width}x${height}:r=${fps}:d=${seconds.toFixed(3)}`,
    '-loop', '1', '-i', ORB,
    '-filter_complex', filter, '-map', '[v]',
    '-t', seconds.toFixed(3), '-r', String(fps),
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    outFile], { stdio: ['ignore', 'ignore', 'pipe'] });

  return outFile;
}

module.exports = { renderBackground, ensureOrb, BG, ORB };
