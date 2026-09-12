'use strict';
/*
 * The house style, in one place. Everything that decides how a video *sounds*
 * lives here so the generator, the validator and the renderer can never drift
 * apart.
 */

// Every Hebrew subtitle line must land in this range. Not a suggestion — the
// validator rejects scripts that break it and the generator retries.
const MIN_WORDS = 4;
const MAX_WORDS = 6;

// Emoji and the RTL/LTR marks don't count as words, and they break naive splits.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{200E}\u{200F}\u{202A}-\u{202E}]/gu;

function stripEmoji(text) {
  return String(text || '').replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
}

function countWords(text) {
  const clean = stripEmoji(text);
  if (!clean) return 0;
  return clean.split(' ').filter(Boolean).length;
}

function lineIsLegal(text) {
  if (/\n/.test(String(text || ''))) return false; // one line, always
  const n = countWords(text);
  return n >= MIN_WORDS && n <= MAX_WORDS;
}

/*
 * Gender-neutral check.
 *
 * Two traps here, both of which quietly break the naive version:
 *
 * 1. JavaScript's \b is defined against [A-Za-z0-9_], so a Hebrew letter is not
 *    a word character and /\bאתה\b/ never matches anything. A blocklist built on
 *    \b is dead code that always passes. So we tokenise instead.
 * 2. "את" is both the feminine "you" AND the accusative particle that appears in
 *    a huge share of ordinary Hebrew sentences. Blocking it outright rejects
 *    perfectly good copy. As a pronoun it almost always opens the clause, so it
 *    is flagged only in first position.
 */
const SINGULAR_ADDRESS = new Set([
  'אתה', 'אותך', 'שלך', 'בשבילך', 'לך', 'איתך', 'ממך', 'עליך',
  'תתחיל', 'תתחילי', 'תעשה', 'תעשי', 'תוכל', 'תוכלי', 'תזכור', 'תזכרי',
  'קח', 'קחי', 'תכתוב', 'תכתבי', 'תנסה', 'תנסי',
  // deliberately NOT here: צריך and כדאי read as impersonal in Hebrew
  // ("צריך להתחיל" = one needs to start), so blocking them costs good copy.
]);

function tokens(text) {
  return stripEmoji(text)
    .replace(/[.,!?;:"'״׳()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function addressesOnePerson(text) {
  const t = tokens(text);
  if (t[0] === 'את') return true;               // pronoun in subject position
  return t.some((w) => SINGULAR_ADDRESS.has(w));
}

/*
 * The 11 emotional drivers. Each video is built on exactly one of them so the
 * emotional through-line stays sharp instead of muddling five feelings at once.
 * `angle` is what goes into the writing prompt.
 *
 * These were rewritten on 2026-09-12. The first set was the standard direct
 * response list — fear, status, money, scarcity, anger — and on an account
 * about ADHD it was actively counterproductive. Those levers all work by making
 * the viewer feel behind, and a person with ADHD has been made to feel behind
 * since primary school. The videos that came out of it read like a money guru's
 * page ("most people waste hours for free") and contradicted the one line in
 * the bio that matters: this is not laziness.
 *
 * So the drivers below are the ones that actually move this audience. They work
 * by removing shame rather than applying it. Nothing here is allowed to imply
 * the viewer is lazy, broken, or behind.
 */
const MOTIVATORS = [
  {
    key: 'recognition',
    name: 'הכרה',
    angle: 'Describe one very specific everyday ADHD moment in such precise detail that the viewer feels watched. Not a general struggle, a scene: the exact tab still open, the exact message left unanswered for nine days, the laundry moved from the machine to the chair. The feeling to produce is "this is literally me, how do they know".',
  },
  {
    key: 'relief',
    name: 'הקלה',
    angle: 'Take something the viewer privately blames themselves for and explain the mechanism behind it. The relief comes from learning there is a reason, and that the reason is not a character flaw. Never say they are lazy, and never imply they simply have not tried hard enough. The feeling is a breath out.',
  },
  {
    key: 'mechanism',
    name: 'איך המוח עובד',
    angle: 'Pure curiosity about the ADHD brain. Explain one concrete mechanism in plain language: why interest beats importance, why a deadline suddenly unlocks everything, why the boring task is physically harder than the hard task. Teach something real. The feeling is "oh, that is what is happening in there".',
  },
  {
    key: 'reframe',
    name: 'מבט אחר',
    angle: 'Take a piece of standard productivity advice the viewer has been given a hundred times, and show precisely why it fails on this brain. Then give the version that fits it instead. The feeling is "so it was not me failing the method, the method did not fit me".',
  },
  {
    key: 'momentum',
    name: 'תנועה',
    angle: 'Starting is the whole problem, so talk about nothing except the first sixty seconds. One trick that makes the opening move small enough to actually happen. Not the plan, not the system, just the first move. The feeling is "I could do that right now".',
  },
  {
    key: 'agency',
    name: 'שליטה',
    angle: 'One small lever that genuinely works, put back in the viewer hands. Not control over their whole life, control over the next hour. Concrete and testable today. The feeling is quiet capability, not hype.',
  },
  {
    key: 'ease',
    name: 'פשטות',
    angle: 'Make the move small enough to be believable. No overhaul, no new system to maintain, nothing that needs the viewer to already be organised in order to get organised. It has to fit inside the life they already have on a bad day, not a good one.',
  },
  {
    key: 'pride',
    name: 'גאווה',
    angle: 'A small win that the viewer would normally dismiss, taken seriously. Explain why that particular win is harder for this brain than for others, and therefore counts for more. The feeling is being credited for something nobody has ever credited them for.',
  },
  {
    key: 'belonging',
    name: 'שייכות',
    angle: 'Not about the product but about who else is here. You are not the only one whose brain does this. Describe the shared experience precisely enough that it reads as real people rather than a slogan. Warmth and acceptance, never pity.',
  },
  {
    key: 'hope',
    name: 'תקווה',
    angle: 'Paint a concrete picture of an ordinary day that goes a little better. Not a transformed life, a normal Tuesday where one thing that usually collapses does not. Modest, specific and believable. Overpromising here destroys trust with this audience faster than anything else.',
  },
  {
    key: 'honesty',
    name: 'כנות',
    angle: 'Say the hard part out loud without dressing it up. Some days nothing works, some tasks stay undone for months, and no method fixes that completely. Then say what is still worth doing anyway. The feeling is being told the truth by someone who is not selling a miracle.',
  },
];

/*
 * The closing call to action, word for word as the founder specified.
 * Split into 4-6 word lines so it obeys the same subtitle rule as everything else.
 *
 * Instagram gets the comment CTA (comments are the goal, and a comment can be
 * answered with a DM). TikTok and YouTube have no reliable comment-to-DM path,
 * so they send people to the profile link instead.
 */
const CTA = {
  // Instagram's close is a three line end card, word for word and break for
  // break as the founder specified. `card: true` exempts it from the one line
  // and 4 to 6 word rules — the last line is a single word on purpose. That
  // exemption applies to the closing card only, never to a translation line.
  instagram: [
    {
      he: 'תגיבו "אני" אם הגעתם עד לכאן,\nוקבלו 7 ימי ניסיון באפליקציה\nבחינם 👇',
      en: 'Comment the word me if you made it this far, and get seven free trial days inside the app.',
      card: true,
    },
  ],
  // TikTok and YouTube close on their own card: two lines, a blank line, then
  // one line. Also specified word for word and break for break.
  tiktok: [
    {
      he: 'רוצים לקבל 7 ימי ניסיון\nבאפליקציה בחינם?\n\nכנסו לקישור בפרופיל שלנו.',
      en: 'Do you want seven free trial days inside the app? Go to the link in our profile.',
      card: true,
    },
  ],
  youtube: [
    {
      he: 'רוצים לקבל 7 ימי ניסיון\nבאפליקציה בחינם?\n\nכנסו לקישור בפרופיל שלנו.',
      en: 'Do you want seven free trial days inside the app? Go to the link in our profile.',
      card: true,
    },
  ],
};

const CTA_QUERIES = [
  'sunrise mountain top',
  'calm ocean waves',
  'city skyline morning',
  'golden sunset field',
  'open road horizon',
  'forest light path',
];

module.exports = {
  MIN_WORDS,
  MAX_WORDS,
  MOTIVATORS,
  CTA,
  CTA_QUERIES,
  stripEmoji,
  countWords,
  lineIsLegal,
  addressesOnePerson,
  tokens,
};
