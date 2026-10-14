'use strict';
/*
 * validate_one.js — run the pipeline's real validator over one script file.
 *
 *   node scripts/validate_one.js path/to/draft.json
 *
 * Exits 0 and prints "clean" when the script would be accepted, or exits 1 and
 * lists every problem in the same words the generator uses when it rejects a
 * draft and asks the model to try again.
 *
 * This exists so that anything writing a script by hand — a person, or an agent
 * drafting a day of content — can check it against the SAME gate the nightly
 * run uses, instead of against a prose summary of the rules that will drift
 * away from the code the first time a rule changes. The rules changed three
 * times on the address alone.
 */
const fs = require('fs');
const path = require('path');

const { validate } = require('./generate_content.js');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/validate_one.js <draft.json>');
  console.error('The file may hold one script object, or an array of them.');
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
} catch (e) {
  console.error('could not read that file as JSON: ' + e.message);
  process.exit(2);
}

const scripts = Array.isArray(parsed) ? parsed : [parsed];
let bad = 0;

scripts.forEach((draft, i) => {
  const label = scripts.length > 1 ? `script ${i + 1}` : 'script';
  const problems = validate(draft);
  if (!problems.length) {
    console.log(`${label}: clean`);
    return;
  }
  bad++;
  console.log(`${label}: ${problems.length} problem(s)`);
  problems.forEach((p) => console.log('  - ' + p));
});

if (bad) {
  console.log(`\n${bad} of ${scripts.length} script(s) would be rejected.`);
  process.exit(1);
}
console.log(`\nall ${scripts.length} script(s) would be accepted.`);
