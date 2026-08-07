'use strict';
/* Checks the rules that must never silently drift. No API keys needed. */
const { CTA, countWords, lineIsLegal, addressesOnePerson } = require('./lib/copy_rules.js');
const { israelToUTC } = require('./main.js');

let failed = 0;
function check(name, actual, expected) {
  const okay = String(actual) === String(expected);
  if (!okay) failed++;
  console.log(`${okay ? '✓' : '✗'} ${name}${okay ? '' : `  got ${actual}, expected ${expected}`}`);
}

console.log('word counting');
check('plain 5 words', countWords('הדרך היא לא כוח רצון'), 5);
check('emoji does not count', countWords('וקבלו 7 ימי ניסיון בחינם באפליקציה 👇'), 6);
check('quotes do not split', countWords('תגיבו "אני" אם הגעתם עד לכאן'), 6);

console.log('\nevery CTA line obeys the 4 to 6 word rule');
for (const [platform, lines] of Object.entries(CTA)) {
  lines.forEach((l, i) => check(`${platform}[${i}] "${l.he}"`, lineIsLegal(l.he), true));
}

console.log('\nrejects what it should');
check('two lines rejected', lineIsLegal('שורה אחת\nשורה שתיים'), false);
check('three words rejected', lineIsLegal('רק שלוש מילים'), false);
check('seven words rejected', lineIsLegal('אחת שתיים שלוש ארבע חמש שש שבע'), false);

console.log('\ngender neutrality (JS \\b does not work on Hebrew, so this is tokenised)');
check('catches אתה', addressesOnePerson('אתה צריך להתחיל עכשיו מיד'), true);
check('catches שלך', addressesOnePerson('הרשימה שלך מחכה כבר חודשים'), true);
check('catches תתחילי', addressesOnePerson('תתחילי מחר בבוקר בשקט'), true);
check('catches את as pronoun in first position', addressesOnePerson('את יכולה לעשות את זה'), true);
// the accusative particle is ordinary Hebrew and must never be flagged
check('allows accusative את mid sentence', addressesOnePerson('לפתוח את המחברת ולכתוב שורה'), false);
check('allows accusative את after a verb', addressesOnePerson('תדמיינו את עצמכם בעוד שנה'), false);
check('allows clean plural', addressesOnePerson('תתחילו היום בשתי דקות בלבד'), false);

console.log('\nIsrael time to UTC');
// August = IDT, UTC+3
check('summer 07:45 -> 04:45Z', israelToUTC('2026-08-08', '07:45'), '2026-08-08T04:45:00.000Z');
check('summer 22:00 -> 19:00Z', israelToUTC('2026-08-08', '22:00'), '2026-08-08T19:00:00.000Z');
// January = IST, UTC+2
check('winter 07:45 -> 05:45Z', israelToUTC('2027-01-10', '07:45'), '2027-01-10T05:45:00.000Z');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
