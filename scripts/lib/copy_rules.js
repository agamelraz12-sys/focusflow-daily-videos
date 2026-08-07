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
 * The 11 survival motivators. Each video is built on exactly one of them so the
 * emotional through-line stays sharp instead of muddling five feelings at once.
 * `angle` is what goes into the writing prompt.
 */
const MOTIVATORS = [
  {
    key: 'fear',
    name: 'פחד',
    angle: 'Build a concrete negative scenario the viewer can picture themselves inside. Use "what if", "what happens if you do not", "imagine that". The feeling to produce is unease and urgency to act now so they do not regret it later.',
  },
  {
    key: 'status',
    name: 'סטטוס חברתי',
    angle: 'Show that after using this, people around them treat them differently — a question someone asks them, a friend reacting, a compliment they receive. Put them somewhere higher without saying it outright.',
  },
  {
    key: 'money',
    name: 'כסף',
    angle: 'Talk in clear numbers. Show income earned or expense avoided in a way they feel in their pocket. High return for small investment. Simple and direct: do this, get that. No tricks.',
  },
  {
    key: 'ease',
    name: 'פשטות ונוחות',
    angle: 'Make it feel effortless. No genius required, it fits inside their existing life, it almost does itself. This is the simplest solution they will find and starting takes no effort at all.',
  },
  {
    key: 'saving',
    name: 'חיסכון',
    angle: 'Focus on what they will NOT have to spend — time, money, energy — not only on what they gain. Compare against the alternative: instead of hours of work, it happens by itself. Smarter, more efficient, more worthwhile.',
  },
  {
    key: 'opportunity',
    name: 'הזדמנות נדירה',
    angle: 'A once-in-a-lifetime window, not something that repeats. Add time pressure: something is changing, about to close, almost too late. The world is moving on and standing still means being left behind. A small pinch of FOMO, not a hard shove.',
  },
  {
    key: 'security',
    name: 'ביטחון',
    angle: 'Radiate stability and dissolve worry. Whatever happens, they are covered. Talk about a result that lasts, a method that works again and again, a way back they can always return to. They are not taking a risk.',
  },
  {
    key: 'control',
    name: 'שליטה',
    angle: 'Move them from dependence to power. "You decide", "you are in control", "not dependent on anyone". They take the wheel back — from a platform, from other people, from their own time. They are the one who sets the terms now.',
  },
  {
    key: 'anger',
    name: 'כעס',
    angle: 'Touch a real frustration — being played, being sold nonsense, being fed up. A slightly cynical note, a sharper word, a rebellious tone. They are finally taking their own side, and getting even the smart way. Add a sense of justice.',
  },
  {
    key: 'freedom',
    name: 'חופש',
    angle: 'Life without dependence, without limits, without a boss, without fixed hours. Describe enjoying life while things keep working in the background. Calm, airy, light, almost soothing language. Make them want to breathe and remember they deserve it.',
  },
  {
    key: 'belonging',
    name: 'שייכות',
    angle: 'Not about the product but about who else is here. Create togetherness: you are not alone in this. Describe a living, supportive group the viewer would want to belong to. Warmth, acceptance, strength that comes from the group.',
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
  instagram: [
    { he: 'תגיבו "אני" אם הגעתם עד לכאן', en: 'Comment the word me if you made it this far.' },
    { he: 'וקבלו 7 ימי ניסיון בחינם באפליקציה 👇', en: 'And get seven free trial days inside the app.' },
  ],
  tiktok: [
    { he: 'רוצים את 7 ימי הניסיון?', en: 'Do you want the seven free days?' },
    { he: 'הקישור בפרופיל, לחצו והורידו עכשיו 👇', en: 'The link is in my profile. Tap it and download now.' },
  ],
  youtube: [
    { he: 'רוצים את 7 ימי הניסיון?', en: 'Do you want the seven free days?' },
    { he: 'הקישור בפרופיל, לחצו והורידו עכשיו 👇', en: 'The link is in my profile. Tap it and download now.' },
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
