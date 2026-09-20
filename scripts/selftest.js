'use strict';
/* Checks the rules that must never silently drift. No API keys needed. */
const {
  CTA, MIN_FEMININE_LINES, MOTIVATORS: MOTIVATORS_FOR_TEST,
  countWords, lineIsLegal, dodgesHer, carriesFeminineMark, countFeminine,
} = require('./lib/copy_rules.js');
const { israelToUTC } = require('./main.js');

let failed = 0;
function check(name, actual, expected) {
  const okay = String(actual) === String(expected);
  if (!okay) failed++;
  console.log(`${okay ? '✓' : '✗'} ${name}${okay ? '' : `  got ${actual}, expected ${expected}`}`);
}

console.log('word counting');
check('plain 5 words', countWords('הדרך היא לא כוח רצון'), 5);
check('emoji does not count', countWords('וקבלי 7 ימי ניסיון בחינם באפליקציה 👇'), 6);
check('quotes do not split', countWords('תגיבי "אני" אם את עדיין כאן'), 6);

console.log('\nCTA lines');
for (const [platform, lines] of Object.entries(CTA)) {
  lines.forEach((l, i) => {
    if (l.card) {
      // End cards were specified line by line and break by break. They are
      // exempt from the word rule on purpose, so assert their exact shape
      // instead — that is the thing that must not drift.
      const rows = l.he.split('\n');
      const expected = platform === 'instagram'
        ? ['תגיבי "אני" אם את עדיין כאן,', 'וקבלי 7 ימי ניסיון באפליקציה', 'בחינם 👇']
        : ['את רוצה 7 ימי ניסיון', 'באפליקציה בחינם?', '', 'כנסי לקישור בפרופיל שלנו.'];
      check(`${platform}[${i}] card row count`, rows.length, expected.length);
      expected.forEach((want, n) => check(`${platform}[${i}] row ${n + 1}`, rows[n], want));
    } else {
      check(`${platform}[${i}] "${l.he}" obeys 4 to 6 words`, lineIsLegal(l.he), true);
    }
  });
}

console.log('\nrejects what it should');
check('two lines rejected', lineIsLegal('שורה אחת\nשורה שתיים'), false);
check('three words rejected', lineIsLegal('רק שלוש מילים'), false);
check('seven words rejected', lineIsLegal('אחת שתיים שלוש ארבע חמש שש שבע'), false);

/*
 * The account speaks to one woman (2026-09-18). These checks used to assert the
 * exact opposite and were rewritten with the rule, not worked around. JS's \b is
 * defined against [A-Za-z0-9_], so it never matches a Hebrew word boundary and a
 * blocklist built on it is dead code that always passes — hence the tokeniser.
 */
console.log('\nspeaks to her: catches the wrong address');
check('catches אתה', !!dodgesHer('אתה צריך להתחיל עכשיו מיד'), true);
check('catches a masculine order opening the line', !!dodgesHer('תתחיל מחר בבוקר בשקט'), true);
check('catches קח anywhere in the line', !!dodgesHer('פשוט קח דף וכתוב שורה'), true);
check('catches plural verbs', !!dodgesHer('תתחילו היום בשתי דקות בלבד'), true);
check('catches plural possessive', !!dodgesHer('הרשימה שלכם מחכה כבר חודשים'), true);
check('catches plural past tense', !!dodgesHer('אם הגעתם עד לכאן תגיבו'), true);

console.log('\nspeaks to her: leaves good copy alone');
check('allows feminine singular', !!dodgesHer('תתחילי מחר בבוקר בשקט'), false);
check('allows שלך, which is both genders', !!dodgesHer('הרשימה שלך מחכה כבר חודשים'), false);
check('allows את as pronoun', !!dodgesHer('את לא עצלנית, זה ADHD'), false);
// the accusative particle is ordinary Hebrew and must never be flagged
check('allows accusative את mid sentence', !!dodgesHer('לפתוח את המחברת ולכתוב שורה'), false);
// a feminine noun takes the same verb form as a masculine "you" — this is the
// false positive that a flat blocklist produces, and it must not come back
check('allows a feminine noun subject', !!dodgesHer('המשימה תמשיך לחכות שם'), false);
check('allows a plain description', !!dodgesHer('המוח מחפש עניין ולא חשיבות'), false);

console.log('\nfeminine that survives being read out loud');
check('תתחילי can only be read one way', carriesFeminineMark('תתחילי מהדבר הכי קטן'), true);
check('שתתחילי counts too', carriesFeminineMark('אין צורך שתתחילי מהסוף'), true);
check('את as subject counts', carriesFeminineMark('את לא צריכה עוד שיטה'), true);
// spelled identically for both genders, so the narrator has to guess — these
// must NOT count towards the quota, which is the entire point of the check
check('שלך does not count, it is spelled the same', carriesFeminineMark('הרשימה שלך מחכה כבר חודשים'), false);
check('הגעת does not count either', carriesFeminineMark('הגעת עד לכאן וזה מספיק'), false);
check('counts across a script', countFeminine([
  'את לא עצלנית, זה ADHD',
  'המוח מחפש עניין ולא חשיבות',
  'תתחילי מהדבר הכי קטן',
  'תרגישי את זה תוך דקה',
]), 3);
check('the quota is reachable', countFeminine([
  'את לא עצלנית, זה ADHD',
  'תתחילי מהדבר הכי קטן',
  'תרגישי את זה תוך דקה',
]) >= MIN_FEMININE_LINES, true);

console.log('\nline breaks survive the trip to ASS');
// stripEmoji collapses whitespace, so a card handed over whole came out as one
// long line. The card must arrive as separate \N rows.
const { rtlForTest } = require('./render_video.js');
const card = 'שורה אחת\nשורה שתיים\n\nשורה שלוש';
check('three visible rows plus a blank one', (rtlForTest(card).match(/\\N/g) || []).length, 3);
check('first row kept intact', /שורה אחת/.test(rtlForTest(card)), true);
check('last row kept intact', /שורה שלוש/.test(rtlForTest(card)), true);

/*
 * The research guards (2026-09-20). Three separate promises are being kept
 * here and each one breaks silently if it drifts: a number said out loud came
 * from a real study, a video never turns into diet content, and a video never
 * tells her to take something.
 */
console.log('\nresearch library');
const R = require('./lib/research.js');
check('every pillar has facts', R.PILLAR_KEYS.every((k) => R.factsFor(k).length > 0), true);
check('every fact declares a source', R.FACTS.every((f) => typeof f.source === 'string' && f.source.length > 20), true);
check('every fact belongs to a real pillar', R.FACTS.every((f) => f.pillars.every((p) => R.PILLAR_KEYS.includes(p))), true);
check('fact ids are unique', new Set(R.FACTS.map((f) => f.id)).size, R.FACTS.length);
// The tier rule, asserted rather than trusted: a fact that was not verified at
// the primary source must carry no number at all, because a number on offer is
// a number that gets spoken.
check('non-citable facts carry no numbers', R.FACTS.filter((f) => !f.citable).every((f) => !(f.numbers || []).length), true);
// Anything touching a medicine, a supplement or a test has to say how to say it.
check('every medical fact carries a frame', R.FACTS.filter((f) => f.medical).every((f) => typeof f.frame === 'string'), true);
check('a non-citable fact licenses no number', R.allowedNumbers([R.factById('masking')]).size, 0);
check('a citable fact licenses its own numbers', R.allowedNumbers([R.factById('pmdd')]).has('31.4'), true);
check('2,364 and 2364 are the same number', R.allowedNumbers([R.factById('time-blind')]).has('2364'), true);
// A figure said as a percentage has to have been one in the study. time-blind
// permits 26 because it counted 26 studies, and "26 אחוז מהנשים" would be a
// fabricated statistic wearing a real number.
check('a study count is not a percentage', R.percentNumbers([R.factById('time-blind')]).size, 0);
check('a real percentage is recognised as one', R.percentNumbers([R.factById('pmdd')]).has('31.4'), true);
check('and 715 women is not a percentage', R.percentNumbers([R.factById('pmdd')]).has('715'), false);

console.log('\nspotting a research claim');
check('מחקר is a strong marker', R.claimsResearch('מחקר חדש מצא משהו מעניין').strong, true);
check('אחוז is a numeric marker', R.claimsResearch('שלושים אחוז מהנשים חוות את זה').numeric, true);
check('an ordinary scene line is neither',
  R.claimsResearch('הטופס פתוח כבר 11 ימים').strong || R.claimsResearch('הטופס פתוח כבר 11 ימים').numeric, false);
check('digits are read out of a line', R.numbersIn('במחקר על 715 נשים נמצא 31.4 אחוז').join(','), '715,31.4');

console.log('\ntwo things this account never says');
const { mentionsDiet, prescribes } = require('./lib/copy_rules.js');
// משקל is the case a naive stemmer loses: מ and ש are both Hebrew prefix
// letters, so stripping them turns the banned word into קל and it stops
// matching itself. If this check ever goes red, that is what happened.
check('משקל is caught', mentionsDiet('המשקל שלך לא מעיד עלייך').length, 1);
check('a prefixed diet word is caught', mentionsDiet('בדיאטה הזאת נכשלת שוב').length, 1);
check('ordinary food talk is left alone', mentionsDiet('אכלת רק קפה עד ארבע').length, 0);
check('an instruction to take iron is caught', prescribes('קחי ברזל כל בוקר'), true);
check('naming iron is not prescribing', prescribes('ברזל הוא חומר גלם לדופמין'), false);

/*
 * Noun agreement. Writing to her makes the model agree with HER when it should
 * be agreeing with the noun, and a real generated script did exactly this on
 * 2026-09-20 ("זו לא חוסר הקשבה", חוסר being masculine). The check is narrow on
 * purpose; these cases are the shape it must keep catching.
 */
console.log('\nnoun agreement, not her agreement');
const { disagrees } = require('./lib/copy_rules.js');
check('זו with a masculine noun is caught', !!disagrees('זו לא חוסר הקשבה שלך'), true);
check('זה with a feminine noun is caught', !!disagrees('זה בעיה מוכרת מאוד'), true);
check('לא between them does not hide it', !!disagrees('זו לא רגע אחד קשה'), true);
check('the definite article does not hide it', !!disagrees('זו הקושי הגדול שלך'), true);
check('correct agreement passes', !!disagrees('זה לא חוסר הקשבה שלך'), false);
check('correct feminine agreement passes', !!disagrees('זו בעיה מוכרת מאוד'), false);
check('זה followed by a verb is left alone', !!disagrees('זה לא אומר שאת אשמה'), false);
check('a line with no demonstrative is left alone', !!disagrees('המוח שלך עובד אחרת'), false);

/*
 * The brief itself. This is the longest instruction in the system and the one
 * place a template slip hides in silence: a broken interpolation still
 * produces a perfectly valid script, just one written to nobody in particular.
 * No API key needed, the prompt is built locally.
 */
console.log('\nthe brief renders whole');
const { buildPrompt } = require('./generate_content.js');
const foodPillar = R.PILLARS.find((p) => p.key === 'food');
const brief = buildPrompt(MOTIVATORS_FOR_TEST[0], foodPillar, R.factsFor('food'), 'nothing yet', '');
check('names the part of her life', brief.includes('WHICH PART OF HER LIFE'), true);
check('carries the pillar in Hebrew', brief.includes('אוכל'), true);
check('carries the facts with their ids', brief.includes('[binge]') && brief.includes('[ferritin]'), true);
check('spells out the ban on unverified numbers', brief.includes('NO NUMBER from this fact'), true);
check('flags the medical facts', brief.includes('MEDICAL.'), true);
check('subordinates the driver to the pillar', brief.includes('THE DRIVER IS THE TEMPERATURE'), true);
check('pushes research where it matters', brief.includes('USE ONE OF THEM'), true);
check('nothing undefined leaked in', /undefined|\[object Object\]/.test(brief), false);
const dailyBrief = buildPrompt(MOTIVATORS_FOR_TEST[0], R.PILLARS.find((p) => p.key === 'daily'), R.factsFor('daily'), 'x', '');
check('the research push stays off elsewhere', dailyBrief.includes('USE ONE OF THEM'), false);

console.log('\nIsrael time to UTC');
// August = IDT, UTC+3
check('summer 07:45 -> 04:45Z', israelToUTC('2026-08-08', '07:45'), '2026-08-08T04:45:00.000Z');
check('summer 22:00 -> 19:00Z', israelToUTC('2026-08-08', '22:00'), '2026-08-08T19:00:00.000Z');
// January = IST, UTC+2
check('winter 07:45 -> 05:45Z', israelToUTC('2027-01-10', '07:45'), '2027-01-10T05:45:00.000Z');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
