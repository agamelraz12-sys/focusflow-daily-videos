'use strict';
/*
 * load_queue.js — install hand written scripts as the nightly queue.
 *
 *   node scripts/load_queue.js draft1.json draft2.json ...
 *   node scripts/load_queue.js --dir /path/to/drafts          (all *.json in it)
 *   node scripts/load_queue.js --append draft9.json           (add, do not replace)
 *
 * Every script is run through the real validator first, and NOTHING is written
 * unless all of them pass. A queue is what the pipeline reaches for before it
 * calls the writer, so a bad entry does not fail loudly: it gets dropped at
 * read time with a warning nobody is awake to see, and that slot posts nothing.
 *
 * The queue it replaces is archived next to it rather than deleted, because the
 * old one has been wrong twice now in ways that were only obvious later: once
 * in the plural voice, once written entirely about women after the account went
 * back to addressing everyone.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const QUEUE = path.join(ROOT, 'content', 'queue.json');
const { validate } = require('./generate_content.js');

const argv = process.argv.slice(2);
const append = argv.includes('--append');
const dirAt = argv.indexOf('--dir');

let files;
if (dirAt > -1) {
  const dir = argv[dirAt + 1];
  files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => path.join(dir, f));
} else {
  files = argv.filter((a) => !a.startsWith('--'));
}
if (!files.length) {
  console.error('nothing to load. Pass JSON files, or --dir with a folder of them.');
  process.exit(2);
}

const scripts = [];
const problems = [];
for (const f of files) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
    problems.push(`${path.basename(f)}: not readable as JSON (${e.message})`);
    continue;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  list.forEach((draft, i) => {
    const label = list.length > 1 ? `${path.basename(f)}[${i}]` : path.basename(f);
    const bad = validate(draft);
    if (bad.length) {
      problems.push(`${label}: ${bad.length} problem(s)`);
      bad.slice(0, 4).forEach((p) => problems.push('    ' + p));
    } else {
      scripts.push(draft);
    }
  });
}

if (problems.length) {
  console.error(`${problems.length} line(s) of trouble. NOTHING was written:\n`);
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

let existing = [];
try { existing = JSON.parse(fs.readFileSync(QUEUE, 'utf8')); } catch (e) {}

if (!append && existing.length) {
  const stamp = new Date().toISOString().slice(0, 10);
  const archive = path.join(ROOT, 'content', `queue.retired-${stamp}.json`);
  fs.writeFileSync(archive, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log(`archived the ${existing.length} script(s) that were queued, to ${path.basename(archive)}`);
}

const next = append ? [...existing, ...scripts] : scripts;
fs.writeFileSync(QUEUE, JSON.stringify(next, null, 2) + '\n', 'utf8');

console.log(`\nqueue now holds ${next.length} script(s), all of them validated:`);
next.forEach((s, i) => {
  const hook = (s.hook && s.hook.he) || '?';
  console.log(`  ${String(i + 1).padStart(2)}. ${String(s.pillar || '?').padEnd(14)} ${hook}`);
});
console.log('\nThe nightly run takes the oldest first and only drops one once a video has actually been scheduled.');
