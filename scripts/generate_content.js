'use strict';
/*
 * generate_content.js — writes a brand new script for one video.
 *
 * Nothing here is picked from a fixed list of topics. Every run asks the model
 * for something it has never produced before, checks the result against the
 * house rules, and only then lets it through. Whatever gets used is written to
 * content/ledger.json so the next run can be told to stay away from it.
 *
 * Usage:
 *   node scripts/generate_content.js            # write one script, print it
 *   node scripts/generate_content.js --count 6  # write a full day
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const {
  AVATAR, MOTIVATORS, CTA, CTA_QUERIES,
  countWords, lineIsLegal, picksAGender, tokens,
  mentionsDiet, prescribes, disagrees,
} = require('./lib/copy_rules.js');
const {
  PILLARS, TRIVIAL_NUMBERS, factById, factsFor, allowedNumbers, percentNumbers,
  numbersIn, claimsResearch,
} = require('./lib/research.js');

const ROOT = path.join(__dirname, '..');
const LEDGER_PATH = path.join(ROOT, 'content', 'ledger.json');

// Read lazily, not at module load: when this file is run directly the .env is
// only loaded further down, so capturing these up here would always see undefined.
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const apiKey = () => process.env.GEMINI_API_KEY;

/*
 * How many value cues sit between the hook and the turn block. Each cue is one
 * subtitle line and one clip, so this number sets the length of the video.
 *
 * 12 lands around 60 seconds. Eighteen was the first try and it produced an
 * 87 second reel, which is long enough that a real share of viewers leave
 * before the call to action ever appears — and comments are the whole point.
 *
 * The validator accepts a range rather than an exact count, so a script written
 * by hand does not have to hit the number on the nose.
 */
const VALUE_CUES = 12;
const VALUE_MIN = 10;
const VALUE_MAX = 20;
const TURN_CUES = 4;

// ---------------------------------------------------------------- ledger ----

function loadLedger() {
  try {
    const led = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    // pillarCursor arrived on 2026-09-20, long after this ledger started
    // filling. An old file has no such key and NaN % 7 is NaN, which would
    // hand every video the same undefined pillar for ever without erroring.
    if (typeof led.pillarCursor !== 'number') led.pillarCursor = 0;
    return led;
  } catch (e) {
    return { motivatorCursor: 0, pillarCursor: 0, used: [] };
  }
}

function saveLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

// The prompt can't carry the whole history forever, so we send the most recent
// slice. Repeats older than this are unlikely to be noticed by a viewer anyway.
function avoidList(ledger, limit = 120) {
  return ledger.used.slice(-limit).map((u) => `- ${u.limitingBelief} / ${u.hookHe}`).join('\n');
}

// ------------------------------------------------------------------ gemini --

/*
 * Gemini answers 503 "model is overloaded" often enough that a single attempt
 * is not a real dependency. One nightly run died at 03:03 that way, before it
 * had written a single word. Ride it out.
 */
async function callGemini(prompt, schema, temperature) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await callGeminiOnce(prompt, schema, temperature);
    } catch (e) {
      last = e;
      if (!/\b(429|500|502|503|504)\b|ECONNRESET|ETIMEDOUT|EPIPE/.test(e.message) || attempt === 3) throw e;
      const wait = 10000 * (attempt + 1);
      console.warn(`  Gemini busy (${e.message.slice(0, 60)}), retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

function callGeminiOnce(prompt, schema, temperature) {
  const key = apiKey();
  if (!key) throw new Error('GEMINI_API_KEY is missing. Put it in .env');
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
  const opts = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${model()}:generateContent`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-goog-api-key': key,
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Gemini ${res.statusCode}: ${d.slice(0, 400)}`));
        try {
          const parsed = JSON.parse(d);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return reject(new Error('Gemini returned no text: ' + d.slice(0, 400)));
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error('Could not parse Gemini reply: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const SCHEMA = {
  type: 'object',
  properties: {
    idea: { type: 'string' },
    limitingBelief: { type: 'string' },
    empoweringBelief: { type: 'string' },
    // Which research findings this script leaned on. Declaring them is what
    // makes the numbers checkable: an invented statistic either arrives with
    // no fact behind it or with an id that is not on the shelf, and both are
    // caught. See the number rules in validate().
    factsUsed: { type: 'array', items: { type: 'string' } },
    caption: { type: 'string' },
    title: { type: 'string' },
    hook: {
      type: 'object',
      properties: {
        he: { type: 'string' },
        en: { type: 'string' },
        query: { type: 'string' },
      },
      required: ['he', 'en', 'query'],
    },
    value: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          he: { type: 'string' },
          en: { type: 'string' },
          query: { type: 'string' },
        },
        required: ['he', 'en', 'query'],
      },
    },
    turn: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          he: { type: 'string' },
          en: { type: 'string' },
          query: { type: 'string' },
        },
        required: ['he', 'en', 'query'],
      },
    },
  },
  required: ['idea', 'limitingBelief', 'empoweringBelief', 'factsUsed', 'caption', 'title', 'hook', 'value', 'turn'],
};

/*
 * Render the research offered to one video.
 *
 * The facts are handed over as a numbered shelf the writer may take from, not
 * as an assignment. A video forced to use a statistic becomes a video built
 * around a statistic, and this account sells recognition rather than trivia —
 * most of the best scripts it has produced contain no number at all. What the
 * shelf changes is that when the writer DOES reach for a fact, there is a real
 * one within reach and an invented one is caught.
 *
 * Every fact prints its own permitted numbers, and a fact whose number was
 * never verified at the primary source prints the ban out loud rather than
 * quietly omitting it. A model told "this finding is real, the figure is not
 * confirmed, say it without a number" complies. A model shown a claim with no
 * figure attached supplies one.
 */
function renderFacts(facts) {
  return facts.map((f, i) => {
    const bits = [`[${f.id}] ${f.claim}`];
    if (f.citable && (f.numbers || []).length) {
      bits.push(`   Numbers you may say out loud from this fact: ${f.numbers.join(', ')}. No others.`);
    } else {
      bits.push('   NO NUMBER from this fact may be spoken. The finding is real, the figure was not verified at the source. State it without a figure.');
    }
    if (f.medical) {
      bits.push('   MEDICAL. You may report what researchers found. You may not tell her to take, stop or change anything. No doses.');
    }
    if (f.frame) bits.push(`   HOW TO SAY IT: ${f.frame}`);
    return bits.join('\n');
  }).join('\n\n');
}

function buildPrompt(motivator, pillar, facts, avoid, complaints) {
  return `You are writing the script for a vertical short video (Instagram Reel / TikTok / YouTube Short).

THE BUSINESS
The account is פוקוס. It is about ADHD, and the product is a mobile app that helps
someone with ADHD actually start and finish the things they meant to do. Getting her to
try the app is the job. The video is the argument.

WHO YOU ARE WRITING TO — one person, and only her
${AVATAR.who} ${AVATAR.life}

She came here for three things, in this order:
${AVATAR.struggles}

Write every line to HER. Not to an audience, not to "people with ADHD", not to a room.
One woman, holding a phone, probably at an hour she meant to be asleep.

VARY THE LIFE THE SCENE COMES FROM, AND NEVER FIX ON ONE. She is anywhere from eighteen
to about fifty, so across videos the scene should move: an assignment that has not been
started, a form from work, a nursery bag that needed packing last night, a shift that got
swapped, a bank app that has not been opened in months, a doctor's appointment nobody
made. Any single video may live in one of those lives. No single LINE may assume it — a
line that only makes sense to a student tells everyone else this account is not for them,
and so does a line that assumes children.

The way to be specific without narrowing is to be specific about THE MOMENT rather than
about her CIRCUMSTANCES. "The message has been sitting unanswered for nine days and the
reply is one sentence" is true at nineteen and at forty five. "Between lectures" is not.

WHICH PART OF HER LIFE THIS VIDEO IS ABOUT: ${pillar.he}
${pillar.scope}

Stay inside it. This is the single most important instruction in the brief, because the
account has one failure mode and this is it: every video drifts back to an unstarted task
and a bad mood, and a woman who came here about her marriage or her body or her job finds
an account that only ever talks about her to-do list. If this video is about food, it is
about food. It may connect to the rest of her life, it may not sit in one of the others
instead.

Moments this part of her life is actually made of, as a sense of the altitude to write at.
Do not retell one of these. Find a different one at the same depth:
${pillar.scenes.map((s) => `  - ${s}`).join('\n')}

FORBIDDEN IN THIS PART OF HER LIFE, and these are not preferences:
${pillar.neverSay}

WHAT THE ACCOUNT BELIEVES, AND WHAT EVERY VIDEO MUST OBEY
The one sentence this whole account is built on is: this is not laziness, this is ADHD.
Everything you write has to be compatible with that sentence.

- Never imply she is lazy, undisciplined, weak willed, wasteful, or behind other people.
  She has been told that her entire life and it is the reason she is here.
- Never imply she is dramatic, unstable, too sensitive or too much. That is the same
  wound in the shape of the mood, and it is the one she is least able to hear.
- Do not write about "self discipline". That is the opposite frame. If a line would fit
  on a generic motivation or hustle account, it is wrong for this one.
- No money angles, no "most people lose thousands", no once in a lifetime urgency, no
  social status, no shaming comparison to other people. These get scrolled past by this
  audience at best and lose a follower at worst.
- Write about how an ADHD brain actually works, and about what to do given that it works
  that way. Interest over importance. Urgency unlocking action. Time blindness. Task
  paralysis when a task is boring rather than hard. The first move being the whole
  problem. Object permanence. Hyperfocus and its cost.
- The feeling is a first class subject here, not a footnote. Emotional regulation running
  on the same machinery as attention. Rejection sensitivity. A mood that arrives at full
  volume with no dimmer. The flat hour after a good day. Boredom that shows up in the
  body. Say these as plainly as you say the task ones.
- Be specific enough to be recognised. "It is hard to start" is nothing. "The form has
  been open in a tab for eleven days and it takes four minutes" is the whole video.
- Do not promise transformation. She has bought transformation before and it did not
  work, and overpromising is the fastest way to lose her. Promise one thing that is a
  bit easier.
- Never claim ADHD is a superpower, and never claim it is a tragedy. Neither is honest.
  This covers the individual traits too, not only the word ADHD: "your sensitivity is a
  real strength", "hyperfocus is your secret weapon", "your brain is just wired for
  greatness". Removing the blame is the job. Flipping the symptom into a gift is a
  different and dishonest thing, and she can hear the difference immediately, because
  the trait genuinely costs her something. Say the cost, then say it is not her fault.
- Do not perform an age at her, in either direction. No slang you had to reach for and no
  trend references, and equally no talking to her as though she is somebody's mother.
  Nothing reads as more out of touch than an account guessing wrong about who is watching.

THE HOUSE FORMULA, taken from the posts that actually performed on this account
Name a precise everyday moment, explain the mechanism underneath it, remove the blame,
then give one concrete move. For example: "The task has been on the list for a week. You
know exactly what needs doing. And still it is not done." Then why that happens. Then
that it is not laziness. Then the one thing that helps.

THIS VIDEO'S EMOTIONAL DRIVER: ${motivator.name}
${motivator.angle}
Weave this driver through the whole script. Do not announce it. Let it be the temperature.

THE DRIVER IS THE TEMPERATURE. THE PILLAR IS THE SUBJECT. If they pull in different
directions, the pillar wins every time. A driver about taking the first small step, aimed
at the part of her life that is her body, is a video about the first small step SHE TAKES
WITH HER BODY — the walk, the glass of water, the appointment finally made — and not a
general video about starting things that happens to have been filed under health. Check
the finished script against this: if you could move it to a different part of her life by
changing two words, you wrote the driver and forgot the subject, and it is wrong.

STRUCTURE
1. hook — the very first line. Its only job is to stop the thumb mid scroll and open a
   curiosity gap so wide that not watching feels uncomfortable. Not a greeting, not a
   summary, not "today I will teach you". A claim, a number, a contradiction, or a
   sentence that sounds wrong until it is explained.
2. value — exactly ${VALUE_CUES} lines. This is the heart. Give real, factual, specific
   substance the viewer can act on TODAY. Name techniques, give numbers, give the exact
   move to make. Ten times more concrete than a normal motivational video. If a line
   could appear in any generic self help post, it is wrong. Somewhere inside these lines
   the limiting belief must be named and dismantled, and the empowering belief installed.
3. turn — exactly ${TURN_CUES} lines, and they come last, right before the call to action.
   This is where the video turns. Everything before it explained why the brain does this.
   These lines show what it looks like when something finally fits that brain instead of
   fighting it. A specific, small, believable scene: the one task that got done, the
   morning that started without the usual twenty minutes of circling.
   Keep it modest. One thing going better, not a life transformed.
   These lines DESCRIBE. They never instruct and they never threaten. "The form got sent
   on Tuesday" is right. "Stop putting things off" is wrong, that is an order. "In a year
   nothing will have changed" is also wrong, that is the shame this account exists to
   remove.

HEBREW RULES — these are hard rules and the script is rejected if any is broken
- Every "he" field is ONE line. Never two lines. Never a line break.
- Every "he" line is between 4 and 6 words. Not 3. Not 7. Count the words.
- Third grade Hebrew. Every single word must be understandable to an eight year old.
  No loan words, no jargon, no clever phrasing that needs a second read.
- NEVER PICK A GENDER. The account is for anyone with ADHD, women and men. This rule was
  the other way round until 2026-10-14 and is now reversed, so ignore any instinct that
  this content should sound feminine. A script is rejected for addressing a man OR a
  woman, and it is the rule most likely to be broken by accident, so read every line back
  for it before returning.
  * Wrong, feminine: את יכולה, תתחילי, תכתבי, תרגישי, בואי, קחי.
  * Wrong, masculine: אתה יכול, תתחיל, תכתוב, קח, בוא.
  * Wrong, plural: תגיבו, תתחילו, שלכם, לכם, אתכם, הגעתם. She rejected the plural
    separately, as sounding like a phone company writing to a customer base.
  * Wrong, clumsy: never a slash form like תתחיל/י or בחר/י. It makes the reader stop
    and parse a slash, and it is the ugliest way to dodge this.
- THE THREE REGISTERS THAT WORK, in order of preference. Reach for the first one first.
  * infinitive: להתחיל מדבר אחד, לכתוב את זה בתגובות, לנסות שוב מחר
  * "we":        נתחיל מדבר אחד, נבחר משימה אחת, ניקח דקה
  * impersonal:  אפשר להתחיל בקטן, לא צריך לסיים הכל היום
  The infinitive is the most direct and should carry most instructions. "we" is warm and
  good for the turn. The impersonal is the softest, so use it least.
- Words Hebrew spells the same for both genders are completely fine and always were:
  שלך, לך, אותך, סיימת, הצלחת, אמרת, רוצה, עונה, עושה. Use them freely. They are how a
  line stays personal without picking a side.
- Check the agreement in every line before you return it: "זו אתגר" is wrong because
  אתגר is masculine, "זה אתגר" is right. The demonstrative agrees with the NOUN.
- Zero dashes anywhere in the Hebrew. No hyphen, no en dash, no em dash.
- Emoji are allowed only in the caption, never inside a "he" line.
- Every line has to be something a real person would actually say out loud. Read it back
  before you commit to it. If it is grammatical but means nothing, it is wrong — a line
  like "תמיד תרגישו אחרי הכסף שלכם" fits the word count and is still nonsense.
- Do not invent precise sounding figures and state them as fact. "One small delay costs
  a thousand shekels" is a made up number pretending to be research. Either build the
  arithmetic openly in front of the viewer, step by step, so they can follow where the
  number comes from, or do not use a number at all. The research below is the one and
  only exception, and it is governed by its own rules.

WHAT RESEARCH SAYS, AND WHAT YOU MAY DO WITH IT
Below are findings about women with ADHD, each one read out of a real study. They are a
shelf, not an assignment. Most good videos on this account use none of them and simply
describe her life accurately, so do not force one in. Reach for one when it does
something a feeling cannot: when it proves to her that a thing she has been blamed for
has a mechanism and a measurement behind it.

${renderFacts(facts)}
${pillar.researchMatters ? `
USE ONE OF THEM IN THIS VIDEO UNLESS THERE IS A REAL REASON NOT TO. This part of her
life is the one where the research about WOMEN with ADHD specifically lives, and almost
none of it has ever reached her. Her body, her cycle, her sleep, her food and the fifteen
years it took anyone to notice are not things she can find on a motivational page, and
they are the whole reason this account is worth following rather than scrolling past. A
video here that is only a feeling has wasted the one advantage it had.
` : ''}
THE RULES ON THOSE FINDINGS, and a script breaking any of them is rejected:
- Any number you speak MUST appear in the permitted numbers above. Not a rounded version
  of it, not a similar one you are confident about, not a number from your own training.
  If the fact you want has no permitted number, say the finding without a number.
- Do not overstate what the number says. Thirty one percent is "about a third", never
  "most women".
- Say it in third grade Hebrew like everything else. "A study of seven hundred women" is
  right. Do not name journals, researchers or years out loud, that is a lecture.
- Never make the video a list of facts. At most one finding carries a video, and the
  video is still about a woman in a moment.
- Return the ids of any facts you used in "factsUsed". If you used none, return an empty
  list. Never put an id there that is not on the shelf above.
- NEVER give medical advice in any line, whether or not it came from a fact. No doses, no
  telling her to take, stop or change a medicine or a supplement, no diagnosing her.
  Saying a blood test exists and that her doctor can order it is allowed.
- NEVER diet talk, in any video, whichever part of her life it is about. No weight, no
  calories, no losing or gaining, no good foods and bad foods, nothing about her body.
  This is absolute and it is the one rule with a person behind it: the women most likely
  to be hurt by a weight video are precisely the women watching this account.

ENGLISH RULES
- "en" is the spoken narration for that same line, read aloud by a text to speech voice.
- One short natural spoken sentence. 7 to 11 words, no more. Every extra word is
  another second of reel, and viewers leave long before a slow video reaches its point.
- It must carry the same meaning as the Hebrew line, but it does not have to be a literal
  translation. It has to sound good out loud.
- Plain words a narrator can say cleanly. No abbreviations, no symbols, no numerals.
  Write numbers as words.

QUERY RULES
- "query" is a stock footage search term for that line, 2 to 4 English words.
- Whoever appears in the frame is a woman, alone, in her own space. Vary her age across
  the script the way the scenes vary: "woman phone bed night", "woman desk paperwork",
  "clothes on chair", "laptop unopened tabs", "kitchen table morning".
- Concrete and filmable. Never abstract: not "success", not "motivation", not
  "discipline". No offices full of teams, no stock happy families.
- Vary them. Two neighbouring lines must not use the same query.

CAPTION AND TITLE
- "caption" is the post caption in Hebrew, under the same language and address rules as
  the lines, 2 to 4 short sentences, ending with a question that invites a comment.
  Emoji allowed here. Do not put a call to action in it, that is added later.
- "title" is a short Hebrew line, under 60 characters, used as the video title.

ALSO RETURN
- "idea" — one short English sentence naming what this video is about, for deduplication.
- "limitingBelief" — the false belief in Hebrew, one short sentence.
- "empoweringBelief" — what replaces it, in Hebrew, one short sentence.
- "factsUsed" — the ids of the findings you actually used, as a list of strings. Empty
  list if none. An id that is not on the shelf above is a rejected script.

NEVER REPEAT
These have already been used. Do not reuse the idea, the angle, or anything close to it.
${avoid || '(nothing yet)'}
${complaints ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED. Fix exactly these problems:\n${complaints}\n` : ''}
Return only the JSON.`;
}

// -------------------------------------------------------------- validation --

function validate(draft) {
  const problems = [];

  /*
   * Resolve the findings the script says it used, against the WHOLE library
   * rather than against the shelf this particular video was shown.
   *
   * That choice matters. Resolving against the shelf would make the check
   * depend on which facts the rotation happened to offer, so a hand written
   * script in content/queue.json — which is never offered anything — could
   * never cite a finding at all. Resolving against the library asks the only
   * question that matters: does this finding exist, and is its number real.
   */
  const declared = (Array.isArray(draft.factsUsed) ? draft.factsUsed : [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  const resolved = declared.map(factById);
  declared.forEach((id, i) => {
    if (!resolved[i]) problems.push(`factsUsed: "${id}" is not a finding in the research library. Remove it, or use the id exactly as it was given.`);
  });
  const allowed = allowedNumbers(resolved.filter(Boolean));
  // A figure spoken as a percentage has to have BEEN a percentage in the
  // study. Without this, `time-blind` permits 26 (it counted 26 studies) and
  // nothing stops that becoming "26 אחוז מהנשים", which is a made up statistic
  // wearing a real number.
  const asPercent = percentNumbers(resolved.filter(Boolean));

  const check = (cue, where) => {
    if (!cue || typeof cue.he !== 'string') { problems.push(`${where}: missing Hebrew`); return; }
    if (/\n/.test(cue.he)) problems.push(`${where}: "${cue.he}" has a line break, must be one line`);
    const n = countWords(cue.he);
    if (n < 4 || n > 6) problems.push(`${where}: "${cue.he}" has ${n} words, must be 4 to 6`);
    if (/[-‐-―]/.test(cue.he)) problems.push(`${where}: "${cue.he}" contains a dash, remove it`);
    // A replacement character or a lone surrogate means the text arrived
    // mangled. It would render as a box burned into the video, so reject it.
    if (/[�]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(cue.he)) {
      problems.push(`${where}: "${cue.he}" contains a broken character, rewrite the line`);
    }
    const gendered = picksAGender(cue.he);
    if (gendered) problems.push(`${where}: "${cue.he}" — ${gendered}`);
    const agreement = disagrees(cue.he);
    if (agreement) problems.push(`${where}: "${cue.he}" — ${agreement}`);
    if (!cue.en || countWords(cue.en) < 5) problems.push(`${where}: English narration too short`);
    if (!cue.query || countWords(cue.query) < 2) problems.push(`${where}: query too vague`);

    // Two things this account may never say, whatever the video is about.
    // Both are checked on every line rather than only inside the pillar that
    // invites them, because a diet line in a video about moods is exactly as
    // harmful as a diet line in a video about food.
    const diet = mentionsDiet(cue.he);
    if (diet.length) {
      problems.push(`${where}: "${cue.he}" is diet talk (${diet.join(', ')}). This account never discusses weight, calories or bodies. Rewrite it about energy or about getting fed.`);
    }
    if (prescribes(cue.he)) {
      problems.push(`${where}: "${cue.he}" tells her to take something. Naming a substance is allowed, instructing her to take it is not. Say what researchers found, or point her at her doctor.`);
    }

    // A number on a line that is making a claim has to have come from the
    // library. See claimsResearch for why this is not simply a ban on digits.
    const claim = claimsResearch(cue.he);
    const nums = numbersIn(cue.he).filter((n) => !TRIVIAL_NUMBERS.has(n));
    const saysPercent = /אחוז|%/.test(cue.he);
    if (saysPercent && nums.length) {
      const notPercent = nums.filter((n) => !asPercent.has(n));
      if (notPercent.length) {
        problems.push(
          `${where}: "${cue.he}" says ${notPercent.join(', ')} as a percentage, and it is not one in the study. ` +
          (asPercent.size
            ? `The only percentages available to you are: ${[...asPercent].join(', ')}.`
            : 'None of the findings you declared contain a percentage at all.'),
        );
      }
    }
    if ((claim.strong || claim.numeric) && nums.length) {
      const bad = nums.filter((n) => !allowed.has(n));
      if (bad.length) {
        problems.push(
          `${where}: "${cue.he}" states ${bad.join(', ')} as research. ` +
          (allowed.size
            ? `The only numbers you may say from the findings you were given are: ${[...allowed].join(', ')}.`
            : 'You declared no findings, so no research number may be spoken at all.') +
          ' Use a permitted number or say it without one.',
        );
      }
    }
    if (claim.strong && !declared.length) {
      problems.push(`${where}: "${cue.he}" invokes research but the script declared no finding in factsUsed. Either name the finding you used or drop the appeal to science.`);
    }
  };

  check(draft.hook, 'hook');
  if (!Array.isArray(draft.value) || draft.value.length < VALUE_MIN || draft.value.length > VALUE_MAX) {
    problems.push(`value: got ${draft.value?.length} lines, need between ${VALUE_MIN} and ${VALUE_MAX}`);
  }
  (draft.value || []).forEach((c, i) => check(c, `value[${i}]`));
  if (!Array.isArray(draft.turn) || draft.turn.length !== TURN_CUES) {
    problems.push(`turn: got ${draft.turn?.length} lines, need exactly ${TURN_CUES}`);
  }
  (draft.turn || []).forEach((c, i) => check(c, `turn[${i}]`));

  if (!draft.caption) problems.push('caption: missing');
  if (!draft.limitingBelief) problems.push('limitingBelief: missing');

  // The caption is published text too, and it is the part a reader can screenshot.
  // It is exempt from the line length rules, never from what may not be said.
  if (draft.caption) {
    const capDiet = mentionsDiet(draft.caption);
    if (capDiet.length) problems.push(`caption: diet talk (${capDiet.join(', ')}). Rewrite it.`);
    if (prescribes(draft.caption)) problems.push('caption: tells her to take something. Remove the instruction.');
    const capNums = numbersIn(draft.caption).filter((n) => !TRIVIAL_NUMBERS.has(n));
    const capClaim = claimsResearch(draft.caption);
    if ((capClaim.strong || capClaim.numeric) && capNums.length) {
      const bad = capNums.filter((n) => !allowed.has(n));
      if (bad.length) problems.push(`caption: states ${bad.join(', ')} as research, which is not a permitted number.`);
    }
  }

  /*
   * There used to be a quota here demanding at least three unmistakably
   * FEMININE lines per script, because the narrator had to be stopped from
   * guessing. On 2026-10-14 the account went back to addressing nobody's
   * gender, which removes the problem at the root rather than solving it: a
   * line in the infinitive cannot be narrated as the wrong gender, because it
   * does not carry one. The quota is gone, not disabled, and `picksAGender`
   * now rejects both directions per line.
   */

  /*
   * THE HOOK IS THE WHOLE VIDEO, so it gets its own check.
   *
   * Everything downstream is wasted if nobody watches past the first line, and
   * the failure mode is specific and recognisable: the model writes a title
   * instead of a hook. "דרכים להתחיל משימות" is a heading. "המשימה הזאת
   * יושבת ברשימה שבוע, ולוקחת ארבע דקות" is a hook. The difference is that a
   * hook opens something the viewer now needs closed.
   *
   * Only shapes that are mechanically detectable are checked here; the rest of
   * the work is done by the brief. A greeting or an announcement of what the
   * video will cover is the one thing worth refusing outright.
   */
  const hookHe = draft.hook && typeof draft.hook.he === 'string' ? draft.hook.he : '';
  if (hookHe) {
    const t = tokens(hookHe);
    const ANNOUNCEMENTS = ['היום', 'בסרטון', 'בפוסט', 'נדבר', 'אספר', 'נלמד', 'שלום', 'היי', 'ברוכים'];
    const announces = ANNOUNCEMENTS.filter((w) => t.includes(w));
    // "היום" alone is fine inside a scene ("היום שלך התחיל אחרת"); it is only
    // an announcement next to one of the telling verbs.
    const telling = ['נדבר', 'אספר', 'נלמד', 'בסרטון', 'בפוסט'].some((w) => t.includes(w));
    if (telling) {
      problems.push(`hook: "${hookHe}" announces what the video will be about. A hook opens a gap, it does not introduce one. Start inside the scene instead.`);
    } else if (announces.includes('שלום') || announces.includes('היי') || announces.includes('ברוכים')) {
      problems.push(`hook: "${hookHe}" opens with a greeting. Nobody stops scrolling for a greeting. Open on the claim.`);
    }
  }

  return problems;
}

// ------------------------------------------------------------------ public --

/*
 * Produce one validated script. Retries with the validator's complaints fed
 * back into the prompt, because a model that is told exactly which line is
 * seven words long fixes it far more reliably than one told to try again.
 */
/*
 * Scripts can also be queued by hand in content/queue.json. Anything sitting
 * there is used first, oldest at the front, and is validated exactly like a
 * generated one. This is what keeps the pipeline runnable before a Gemini key
 * exists, and it is also the way to slot in a script written deliberately.
 */
const QUEUE_PATH = path.join(ROOT, 'content', 'queue.json');

/*
 * Peek at the front of the queue without removing it. The entry is only dropped
 * once the video has actually been scheduled (see `remember`). The first live
 * run consumed a script, then died on a network error, and the script was gone
 * for good — a queue that empties on read loses work every time a run fails.
 */
function takeFromQueue() {
  let queue;
  try { queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); } catch (e) { return null; }
  if (!Array.isArray(queue) || !queue.length) return null;

  const draft = queue[0];
  const problems = validate(draft);
  if (problems.length) {
    console.warn(`  queued script "${draft.idea}" is invalid, dropping it:\n    ${problems.slice(0, 5).join('\n    ')}`);
    queue.shift();
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n', 'utf8');
    return takeFromQueue();
  }
  console.log(`  using a queued script (${queue.length - 1} more behind it)`);
  draft._fromQueue = true;
  return draft;
}

function dropFromQueue() {
  let queue;
  try { queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); } catch (e) { return; }
  if (!Array.isArray(queue) || !queue.length) return;
  queue.shift();
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n', 'utf8');
}

async function writeScript({ ledger, attempts = 4, bypassQueue = false, pillarKey = null } = {}) {
  const led = ledger || loadLedger();

  const queued = bypassQueue ? null : takeFromQueue();
  if (queued) {
    queued.motivator = queued.motivator || MOTIVATORS[led.motivatorCursor % MOTIVATORS.length].key;
    queued.pillar = queued.pillar || PILLARS[led.pillarCursor % PILLARS.length].key;
    return queued;
  }

  const motivator = MOTIVATORS[led.motivatorCursor % MOTIVATORS.length];
  /*
   * Two cursors turning at different rates. 13 drivers and 7 pillars share no
   * factor, so the pair walks all 91 combinations before it repeats one — the
   * feed gets the same driver against a different part of her life each time
   * it comes round, which is what stops thirteen drivers from producing
   * thirteen versions of the same video about an unstarted task.
   */
  // `pillarKey` overrides the rotation. Only for reviewing one part of her
  // life on demand; the nightly run always takes its turn from the cursor.
  const pillar = (pillarKey && PILLARS.find((p) => p.key === pillarKey)) || PILLARS[led.pillarCursor % PILLARS.length];
  const avoid = avoidList(led);
  // Facts used in the last few videos go to the back of the shelf. Without
  // this the writer reaches for the same two strongest findings every time.
  const recentFacts = (led.used || []).slice(-8).flatMap((u) => u.factsUsed || []);
  const facts = factsFor(pillar.key, { limit: 4, avoidIds: recentFacts });

  let complaints = '';
  let lastProblems = [];
  for (let i = 0; i < attempts; i++) {
    const draft = await callGemini(
      buildPrompt(motivator, pillar, facts, avoid, complaints),
      SCHEMA,
      i === 0 ? 1.0 : 0.7, // cool down on retries so it follows the fixes
    );
    const problems = validate(draft);
    if (!problems.length) {
      draft.motivator = motivator.key;
      draft.pillar = pillar.key;
      return draft;
    }
    lastProblems = problems;
    complaints = problems.slice(0, 12).join('\n');
    // Print WHAT was wrong, not just how many. A run that quietly burns three of
    // its four attempts on the same rule is a rule about to start failing whole
    // days, and the count alone never showed which one.
    console.log(`  draft ${i + 1} rejected (${problems.length}): ${problems.slice(0, 3).join(' | ')}`);
  }
  throw new Error('Could not get a clean script after ' + attempts + ' attempts:\n' + lastProblems.slice(0, 8).join('\n'));
}

/*
 * Turn a validated script into the cue list for one platform. The body is
 * shared; only the closing call to action differs, because Instagram wants a
 * comment and the other two want a profile click.
 */
function toCues(draft, platform) {
  const cta = CTA[platform] || CTA.instagram;
  const ctaQuery = CTA_QUERIES[Math.floor(Math.random() * CTA_QUERIES.length)];
  return [
    draft.hook,
    ...draft.value,
    ...draft.turn,
    ...cta.map((c, i) => ({
      he: c.he,
      en: c.en,
      card: c.card,
      query: i === 0 ? ctaQuery : CTA_QUERIES[(CTA_QUERIES.indexOf(ctaQuery) + 2) % CTA_QUERIES.length],
    })),
  ];
}

function remember(ledger, draft) {
  // Now that the work is genuinely done, the queued entry can go.
  if (draft._fromQueue) dropFromQueue();
  ledger.used.push({
    at: new Date().toISOString(),
    idea: draft.idea,
    limitingBelief: draft.limitingBelief,
    hookHe: draft.hook.he,
    motivator: draft.motivator,
    pillar: draft.pillar,
    // Recorded so the shelf can be rotated, and so that if a finding in the
    // library ever turns out to be wrong, every video that said it can be found.
    factsUsed: Array.isArray(draft.factsUsed) ? draft.factsUsed : [],
  });
  ledger.motivatorCursor = (ledger.motivatorCursor + 1) % MOTIVATORS.length;
  ledger.pillarCursor = (ledger.pillarCursor + 1) % PILLARS.length;
  return ledger;
}

// buildPrompt is exported so the brief can be read without spending an API
// call. It is the longest instruction in the system and the place a template
// slip hides silently, since a broken interpolation still produces a script.
module.exports = { writeScript, toCues, loadLedger, saveLedger, remember, validate, buildPrompt, VALUE_CUES, TURN_CUES };

// --------------------------------------------------------------------- CLI --

if (require.main === module) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const countArg = process.argv.indexOf('--count');
  const count = countArg > -1 ? Number(process.argv[countArg + 1]) : 1;
  // --gemini skips the hand written queue, so the model itself can be tested
  const bypassQueue = process.argv.includes('--gemini');
  // --pillar food   writes about one part of her life instead of taking the
  // next turn of the rotation. For reviewing a pillar, not for the nightly run.
  const pillarArg = process.argv.indexOf('--pillar');
  const pillarKey = pillarArg > -1 ? process.argv[pillarArg + 1] : null;
  if (pillarKey && !PILLARS.some((p) => p.key === pillarKey)) {
    console.error(`unknown pillar "${pillarKey}". Known: ${PILLARS.map((p) => p.key).join(', ')}`);
    process.exit(1);
  }
  (async () => {
    const ledger = loadLedger();
    for (let i = 0; i < count; i++) {
      const draft = await writeScript({ ledger, bypassQueue, pillarKey });
      remember(ledger, draft);
      console.log(`\n=== ${i + 1}/${count} · ${draft.pillar} · ${draft.motivator} · ${draft.idea}`);
      console.log(`מנפץ: ${draft.limitingBelief}`);
      console.log(`מקדם: ${draft.empoweringBelief}`);
      console.log(`מחקר: ${(draft.factsUsed || []).join(', ') || 'none'}\n`);
      toCues(draft, 'instagram').forEach((c, n) => console.log(String(n + 1).padStart(2) + '. ' + c.he));
      console.log('\nכיתוב:\n' + draft.caption);
    }
    saveLedger(ledger);
  })().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
