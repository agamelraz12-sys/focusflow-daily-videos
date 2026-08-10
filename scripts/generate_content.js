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

const { MOTIVATORS, CTA, CTA_QUERIES, countWords, lineIsLegal, addressesOnePerson } = require('./lib/copy_rules.js');

const ROOT = path.join(__dirname, '..');
const LEDGER_PATH = path.join(ROOT, 'content', 'ledger.json');

// Read lazily, not at module load: when this file is run directly the .env is
// only loaded further down, so capturing these up here would always see undefined.
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const apiKey = () => process.env.GEMINI_API_KEY;

/*
 * How many value cues sit between the hook and the fear block. Each cue is one
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
const FEAR_CUES = 4;

// ---------------------------------------------------------------- ledger ----

function loadLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch (e) {
    return { motivatorCursor: 0, used: [] };
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
    fear: {
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
  required: ['idea', 'limitingBelief', 'empoweringBelief', 'caption', 'title', 'hook', 'value', 'fear'],
};

function buildPrompt(motivator, avoid, complaints) {
  return `You are writing the script for a vertical short video (Instagram Reel / TikTok / YouTube Short).

THE BUSINESS
The account sells a guide for building self discipline, and a mobile app that helps people
actually follow through on what they plan. Every single video exists to do one job:
take one limiting belief the viewer holds about self discipline, break it, and replace it
with an empowering belief. The guide is the thing being sold. The video is the argument.

THIS VIDEO'S EMOTIONAL DRIVER: ${motivator.name}
${motivator.angle}
Weave this driver through the whole script. Do not announce it. Let it be the temperature.

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
3. fear — exactly ${FEAR_CUES} lines, and they come last, right before the call to action.
   Paint a vivid, concrete picture of the viewer's future if they do nothing. Not vague
   dread. A specific scene: what a year from now looks like, what they will be telling
   themselves, what will still be exactly the same. Make them feel the cost of standing
   still.
   These lines DESCRIBE a future. They never instruct. "In a year the same list is
   still there" is right. "Keep putting things off" is wrong — that is an order, and it
   reads as though you are telling them to fail.

HEBREW RULES — these are hard rules and the script is rejected if any is broken
- Every "he" field is ONE line. Never two lines. Never a line break.
- Every "he" line is between 4 and 6 words. Not 3. Not 7. Count the words.
- Third grade Hebrew. Every single word must be understandable to an eight year old.
  No loan words, no jargon, no clever phrasing that needs a second read.
- Gender neutral. Never address one person as male or female. Do not use אתה, את,
  תתחיל, תתחילי, שלך in singular. Use plural second person (תגיבו, תתחילו, שלכם) or
  impersonal forms (אפשר, כדאי, מי ש, הדרך היא, אנשים ש). This is not optional.
- Zero dashes anywhere in the Hebrew. No hyphen, no en dash, no em dash.
- Emoji are allowed only in the caption, never inside a "he" line.
- Every line has to be something a real person would actually say out loud. Read it back
  before you commit to it. If it is grammatical but means nothing, it is wrong — a line
  like "תמיד תרגישו אחרי הכסף שלכם" fits the word count and is still nonsense.
- Do not invent precise sounding figures and state them as fact. "One small delay costs
  a thousand shekels" is a made up number pretending to be research. Either build the
  arithmetic openly in front of the viewer, step by step, so they can follow where the
  number comes from, or do not use a number at all.

ENGLISH RULES
- "en" is the spoken narration for that same line, read aloud by a text to speech voice.
- One short natural spoken sentence. Roughly 8 to 14 words so it lasts about 2 to 3 seconds.
- It must carry the same meaning as the Hebrew line, but it does not have to be a literal
  translation. It has to sound good out loud.
- Plain words a narrator can say cleanly. No abbreviations, no symbols, no numerals.
  Write numbers as words.

QUERY RULES
- "query" is a stock footage search term for that line, 2 to 4 English words.
- Concrete and filmable. "woman writing notebook", "empty gym morning", "phone face down".
- Never abstract. Not "success", not "motivation", not "discipline".
- Vary them. Two neighbouring lines must not use the same query.

CAPTION AND TITLE
- "caption" is the post caption in Hebrew, same rules on language and gender, 2 to 4
  short sentences, ending with a question that invites a comment. Emoji allowed here.
  Do not put a call to action in it, that is added later.
- "title" is a short Hebrew line, under 60 characters, used as the video title.

ALSO RETURN
- "idea" — one short English sentence naming what this video is about, for deduplication.
- "limitingBelief" — the false belief in Hebrew, one short sentence.
- "empoweringBelief" — what replaces it, in Hebrew, one short sentence.

NEVER REPEAT
These have already been used. Do not reuse the idea, the angle, or anything close to it.
${avoid || '(nothing yet)'}
${complaints ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED. Fix exactly these problems:\n${complaints}\n` : ''}
Return only the JSON.`;
}

// -------------------------------------------------------------- validation --

function validate(draft) {
  const problems = [];
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
    if (addressesOnePerson(cue.he)) {
      problems.push(`${where}: "${cue.he}" addresses one person, use plural or impersonal`);
    }
    if (!cue.en || countWords(cue.en) < 5) problems.push(`${where}: English narration too short`);
    if (!cue.query || countWords(cue.query) < 2) problems.push(`${where}: query too vague`);
  };

  check(draft.hook, 'hook');
  if (!Array.isArray(draft.value) || draft.value.length < VALUE_MIN || draft.value.length > VALUE_MAX) {
    problems.push(`value: got ${draft.value?.length} lines, need between ${VALUE_MIN} and ${VALUE_MAX}`);
  }
  (draft.value || []).forEach((c, i) => check(c, `value[${i}]`));
  if (!Array.isArray(draft.fear) || draft.fear.length !== FEAR_CUES) {
    problems.push(`fear: got ${draft.fear?.length} lines, need exactly ${FEAR_CUES}`);
  }
  (draft.fear || []).forEach((c, i) => check(c, `fear[${i}]`));

  if (!draft.caption) problems.push('caption: missing');
  if (!draft.limitingBelief) problems.push('limitingBelief: missing');

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

async function writeScript({ ledger, attempts = 4, bypassQueue = false } = {}) {
  const led = ledger || loadLedger();

  const queued = bypassQueue ? null : takeFromQueue();
  if (queued) {
    queued.motivator = queued.motivator || MOTIVATORS[led.motivatorCursor % MOTIVATORS.length].key;
    return queued;
  }

  const motivator = MOTIVATORS[led.motivatorCursor % MOTIVATORS.length];
  const avoid = avoidList(led);

  let complaints = '';
  let lastProblems = [];
  for (let i = 0; i < attempts; i++) {
    const draft = await callGemini(
      buildPrompt(motivator, avoid, complaints),
      SCHEMA,
      i === 0 ? 1.0 : 0.7, // cool down on retries so it follows the fixes
    );
    const problems = validate(draft);
    if (!problems.length) {
      draft.motivator = motivator.key;
      return draft;
    }
    lastProblems = problems;
    complaints = problems.slice(0, 12).join('\n');
    console.log(`  draft ${i + 1} rejected (${problems.length} problems), retrying...`);
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
    ...draft.fear,
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
  });
  ledger.motivatorCursor = (ledger.motivatorCursor + 1) % MOTIVATORS.length;
  return ledger;
}

module.exports = { writeScript, toCues, loadLedger, saveLedger, remember, validate, VALUE_CUES, FEAR_CUES };

// --------------------------------------------------------------------- CLI --

if (require.main === module) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const countArg = process.argv.indexOf('--count');
  const count = countArg > -1 ? Number(process.argv[countArg + 1]) : 1;
  // --gemini skips the hand written queue, so the model itself can be tested
  const bypassQueue = process.argv.includes('--gemini');
  (async () => {
    const ledger = loadLedger();
    for (let i = 0; i < count; i++) {
      const draft = await writeScript({ ledger, bypassQueue });
      remember(ledger, draft);
      console.log(`\n=== ${i + 1}/${count} · ${draft.motivator} · ${draft.idea}`);
      console.log(`מנפץ: ${draft.limitingBelief}`);
      console.log(`מקדם: ${draft.empoweringBelief}\n`);
      toCues(draft, 'instagram').forEach((c, n) => console.log(String(n + 1).padStart(2) + '. ' + c.he));
      console.log('\nכיתוב:\n' + draft.caption);
    }
    saveLedger(ledger);
  })().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
