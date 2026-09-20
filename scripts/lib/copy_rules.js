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
 * WHO EVERY VIDEO IS TALKING TO.
 *
 * Set by the founder on 2026-09-18. One person, not a demographic: the account
 * writes to her and to nobody else. This replaces the 2026-09-12 decision that
 * the content was "for everyone, any age, any gender" — that is over, and the
 * gender-neutral machinery that served it was removed rather than left dormant.
 *
 * It is exported so the writer's brief, the validator and anything built later
 * read the same description instead of three drifting copies of it.
 */
const AVATAR = {
  hebrew: 'אישה עם ADHD, מגיל 18 עד גיל 50',
  who: 'One woman with ADHD, anywhere from eighteen to about fifty. Women only.',
  /*
   * The band was 18 to 25 for a few hours on 2026-09-18 and the founder widened
   * it to 50 the same day. Do not narrow it back.
   *
   * Why this matters beyond reach: a narrow band quietly forces every example
   * into one life, and the moment a video assumes a lecture and a shared flat,
   * the thirty eight year old watching it knows the account is not for her. The
   * specificity that makes a video land therefore moves OUT of the person and
   * INTO the scene, which is where it belonged anyway. The scenes vary from
   * video to video. The woman they are written to does not.
   *
   * At this width she is sometimes a mother, which closes the gap with the
   * product direction — Sol was pointed at mothers with ADHD on 2026-09-17.
   */
  life: [
    'A student, a woman at work, a mother of small children, a woman running her',
    'own thing, or several of those at once. Do not fix on one: pick a different',
    'life for the scene each time, and never write a line that only makes sense',
    'in one of them. What she has instead of an age is the three things below.',
  ].join(' '),
  /*
   * The three things she came here for, in the founder's own order of pain.
   * These, not her age, are what makes a video recognisable — and all three are
   * as true at forty five as they are at nineteen, which is why the band could
   * widen without the content changing underneath it.
   */
  struggles: [
    'MOODS. The feeling moves faster than the day does. A good morning that is',
    'gone by noon for no reason she can name, a small comment that flattens her',
    'for hours, boredom that arrives as physical restlessness, the crash after a',
    'day where everything finally worked. She experiences this as being unstable',
    'or "too much", and nobody has ever told her it is part of the same wiring.',
    'FINISHING. Starting sometimes happens. Finishing almost never does. Nine',
    'things open at once, each one eighty percent done, and the last twenty',
    'percent of every single one is where her life is stuck.',
    'RUNNING AN ORDINARY DAY. The boring machinery of being an adult: the form,',
    'the appointment, the laundry that made it to the chair, the bank app she',
    'has not opened, eating at hours that make sense, going to sleep on purpose.',
  ].join(' '),
};

/*
 * The voice check.
 *
 * Until 2026-09-17 this file enforced the opposite rule — everything had to be
 * gender neutral, and singular address was rejected. The founder reversed that:
 * פוקוס speaks to one woman. Do not "restore" the old guard, the reversal is
 * deliberate and dated. What follows bans the two ways a model dodges back into
 * neutral: masculine address, and the plural she explicitly rejected as sounding
 * like a phone company.
 *
 * Three traps, all of which quietly break the naive version:
 *
 * 1. JavaScript's \b is defined against [A-Za-z0-9_], so a Hebrew letter is not
 *    a word character and /\bאתה\b/ never matches anything. A blocklist built on
 *    \b is dead code that always passes. So we tokenise instead.
 * 2. Hebrew's second person masculine future (תתחיל, תמשיך) is spelled exactly
 *    like the third person feminine future, which agrees with any feminine noun:
 *    "המשימה תמשיך לחכות" is perfect copy and would be rejected by a flat
 *    blocklist. A masculine verb is therefore only flagged in FIRST position,
 *    where it can only be an order given to a man. Pronouns and the imperatives
 *    that have no third person reading at all (אתה, בוא, קח) are flagged anywhere.
 * 3. אפשר and כדאי are deliberately NOT banned. No regex separates "אפשר לבחור
 *    דבר אחד" (an instruction to her) from "אי אפשר להחזיר" (a fact about the
 *    world), and a rule that blocks good copy gets switched off the first time
 *    it fires, after which it guards nothing. The brief discourages them instead.
 */
const MASCULINE_ANYWHERE = new Set([
  'אתה', 'בוא', 'קח', 'שב', 'תן', 'לקחת',
]);

// Flagged only when the line opens with them — see trap 2 above.
const MASCULINE_OPENER = new Set([
  'תתחיל', 'תעשה', 'תוכל', 'תזכור', 'תכתוב', 'תנסה', 'תפתח', 'תבדוק', 'תשים',
  'תראה', 'תחשוב', 'תיקח', 'תבחר', 'תרגיש', 'תגיב', 'תנשום', 'תעצור', 'תמשיך',
  'תפסיק', 'תסיים', 'תשאל', 'תקום', 'תלך', 'תדע', 'תבין', 'תגלה', 'תמצא', 'תשמע',
]);

const PLURAL_ADDRESS = new Set([
  'אתם', 'אתן', 'לכם', 'מכם', 'בכם', 'אתכם', 'אתכן',
  'קחו', 'כנסו', 'קבלו', 'וקבלו', 'בואו', 'שבו', 'לכו', 'תנו', 'שימו', 'זכרו',
  'הגעתם', 'ראיתם', 'שמעתם', 'ניסיתם', 'חשבתם', 'עשיתם', 'הרגשתם', 'ידעתם',
  'שכחתם', 'הגעתן', 'ניסיתן',
]);

function tokens(text) {
  return stripEmoji(text)
    .replace(/[.,!?;:"'״׳()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// שלכם, בשבילכם, אצלכם, עליכם, איתכם — the plural possessive suffix. Four
// letters or more, so the three letter words that merely end that way (חכם)
// are left alone; the genuine three letter ones are in PLURAL_ADDRESS by name.
function isPluralPossessive(word) {
  return word.length >= 4 && word.endsWith('כם');
}

// תתחילו, תגיבו, תרגישו — second person plural. The third person plural takes
// a י prefix (יתחילו), so a ת prefix with a ו ending is second person and
// nothing else. The exceptions are ת-initial nouns carrying a masculine
// possessive (תפקידו, תורו), which cannot occur in copy written to one woman.
function isPluralVerb(word) {
  return /^ת[֐-׿]{2,}ו$/.test(word);
}

/*
 * Returns a short reason the line does not speak to her, or null when it is
 * clean. A line that simply describes something ("המוח מחפש עניין ולא חשיבות")
 * is clean: the rule bans the dodges, it does not demand the marker in every
 * line. The marker is required at the script level instead, by countFeminine.
 */
function dodgesHer(text) {
  const t = tokens(text);
  const masc = t.find((w) => MASCULINE_ANYWHERE.has(w));
  if (masc) return `"${masc}" speaks to a man`;
  if (t.length && MASCULINE_OPENER.has(t[0])) return `"${t[0]}" opens as an order to a man`;
  const plural = t.find((w) => PLURAL_ADDRESS.has(w) || isPluralPossessive(w) || isPluralVerb(w));
  if (plural) return `"${plural}" is plural, write to one woman`;
  return null;
}

/*
 * Does this line CARRY its femininity, rather than merely permit it?
 *
 * Hebrew writes שלך, לך, אותך, הגעת identically for both genders, so a script
 * can read feminine on the page and still be narrated as masculine — the TTS
 * has to choose between mimcha and mimech and gets it wrong often. It happened
 * twice on the promo reel. Only a form with the yod or he ending (תתחילי,
 * מתחילה) can be read one way, so the validator requires a few of those in
 * every script and the narrator never has to guess.
 */
const FEMININE_WORDS = new Set(['בואי', 'קחי', 'שבי', 'תני', 'כנסי', 'קבלי', 'וקבלי', 'לבדי']);

function carriesFeminineMark(text) {
  const t = tokens(text);
  if (t[0] === 'את') return true;                        // pronoun, subject position
  if (t.some((w) => FEMININE_WORDS.has(w))) return true;
  // תתחילי, שתתחילי, תרגישי — second person feminine, unmistakable out loud.
  return t.some((w) => /^ש?ת[֐-׿]{2,}י$/.test(w));
}

function countFeminine(lines) {
  return lines.filter((l) => carriesFeminineMark(l)).length;
}

// How many of a script's ~17 spoken lines must carry an unmistakable feminine
// form. Three is easily reached by copy that genuinely addresses her and is not
// reached at all by copy that hedged its way back to neutral.
const MIN_FEMININE_LINES = 3;

/*
 * TWO THINGS THIS ACCOUNT MAY NEVER SAY, checked rather than requested.
 *
 * Both were added on 2026-09-20, when the content was widened from tasks and
 * moods to her whole life — relationships, work, health and food. Widening the
 * subject widened the ways a video can do real damage, and a prompt rule alone
 * is a rule that holds until the day a model is feeling creative.
 *
 * 1. DIET TALK. Food is now a content pillar, and food content slides into
 *    diet content by default because that is what almost all of it is. This
 *    audience is the wrong audience for it in a specific, evidenced way: women
 *    with ADHD have a markedly raised rate of binge eating and disordered
 *    eating, so the women most likely to be harmed by a weight video are
 *    exactly the women this account is written for. The account talks about
 *    getting fed. It never talks about a body.
 *
 *    משקל and שומן are on the list even though each has an innocent other
 *    meaning, because neither has any business in a sixty second video about
 *    ADHD and the cost of a false rejection is one retry.
 *
 * 2. PRESCRIBING. The research library deliberately contains findings about
 *    iron, omega 3 and melatonin, because they are real and she is entitled to
 *    know about them. Naming a finding is not the danger. Telling her to take
 *    something is: iron without a deficiency does harm, and only a blood test
 *    knows which she is. So the check is deliberately narrow — the substance
 *    may be named, and an instruction to take it may not.
 */
const DIET_WORDS = [
  'קלוריות', 'קלוריה', 'דיאטה', 'דיאטות', 'לרזות', 'הרזיה', 'הרזייה', 'רזה',
  'להשיל', 'שומן', 'שומנים', 'קילו', 'קילוגרם', 'משקל', 'להשמין', 'השמנה',
  'פחמימות', 'מטבוליזם', 'גזרה', 'צום', 'לצום',
];

/*
 * Hebrew glues its prepositions and its definite article onto the front of the
 * word, so a flat equality test misses המשקל, ולרזות and בדיאטה — the same
 * shape of silent failure as the \b trap documented above.
 *
 * The obvious fix, stripping leading prefix letters off each token, is WRONG
 * here and it is worth saying why: מ and ש are both prefix letters, so משקל
 * stems to קל and the single most important word on the list stops matching
 * itself. Build the candidates forward from the banned word instead, never
 * backward from the token.
 */
const PREFIXES = ['', 'ה', 'ו', 'ב', 'ל', 'מ', 'כ', 'ש', 'וה', 'ול', 'וב', 'ומ', 'לה', 'מה', 'שה', 'כש', 'שב', 'של'];

function mentionsDiet(text) {
  const seen = new Set(tokens(text));
  return DIET_WORDS.filter((w) => PREFIXES.some((p) => seen.has(p + w)));
}

// The substances the library is allowed to discuss, and the verbs that turn
// discussing one into prescribing it.
const SUBSTANCES = /(ברזל|מלטונין|אומגה|תוסף|תוספים|ויטמין|כדור|כדורים|ריטלין|קונצרטה|אדרל|תרופה|תרופות)/;
const TAKE_VERBS = /(קחי|תקחי|תיקחי|קחו|לקחת|תתחילי\s+לקחת|תפסיקי\s+לקחת|תבלעי|תוסיפי\s+לעצמך)/;

function prescribes(text) {
  const clean = stripEmoji(text);
  if (!SUBSTANCES.test(clean)) return false;
  return TAKE_VERBS.test(clean);
}

/*
 * THE NOUN AGREEMENT SLIP, caught at last.
 *
 * Writing everything in the feminine makes the model agree with HER when the
 * word it should be agreeing with is the NOUN: "זו לא חוסר הקשבה" instead of
 * "זה לא חוסר הקשבה", because חוסר is masculine. This has been a known problem
 * since the avatar landed on 2026-09-18 and the note then said there was no
 * mechanical check for it and that generated Hebrew had to be read by a human.
 * A real script produced this exact error again on 2026-09-20, so here is one.
 *
 * It is deliberately NOT a general Hebrew grammar checker, which cannot be
 * written here and would be wrong constantly. It knows two short lists of
 * ordinary nouns this account genuinely uses over and over, and it only fires
 * on the one construction that goes wrong: a demonstrative sitting directly in
 * front of one of them. Everything outside those lists passes untouched, which
 * is the right trade — a narrow check that is always right beats a broad one
 * that gets switched off.
 */
const MASC_NOUNS = new Set([
  'חוסר', 'אתגר', 'קושי', 'רגע', 'יום', 'מוח', 'דבר', 'פחד', 'כאב', 'לחץ',
  'זמן', 'מצב', 'ניסיון', 'שינוי', 'הרגל', 'כוח', 'רצון', 'ראש', 'גוף',
  'סימן', 'תהליך', 'מחיר', 'צורך', 'טיפול', 'דפוס', 'עומס', 'חלק', 'סיפור',
]);

const FEM_NOUNS = new Set([
  'בעיה', 'משימה', 'תחושה', 'הרגשה', 'שיחה', 'עבודה', 'מחשבה', 'דרך', 'שעה',
  'שנה', 'ארוחה', 'תרופה', 'בדיקה', 'מערכת', 'סיבה', 'נקודה', 'טעות', 'אמת',
  'שינה', 'רשימה', 'הודעה', 'תשובה', 'שאלה', 'סיטואציה', 'תכונה', 'בחירה',
  'עייפות', 'רגישות', 'בושה', 'אשמה',
]);

// The words that can sit between the demonstrative and its noun without
// changing which of them agree: "זו לא בעיה", "זאת בדיוק התחושה".
const AGREEMENT_SKIP = new Set(['לא', 'בדיוק', 'רק', 'באמת', 'כבר', 'עדיין', 'תמיד', 'פשוט', 'ממש']);

function stripHe(word) {
  return word.length > 2 && word.startsWith('ה') ? word.slice(1) : word;
}

/*
 * Returns a complaint, or '' when the line is fine. Only the first slip is
 * reported: a line with two is a line being rewritten anyway.
 */
function disagrees(text) {
  const toks = tokens(text);
  for (let i = 0; i < toks.length - 1; i++) {
    const dem = toks[i];
    const feminineDem = dem === 'זו' || dem === 'זאת';
    const masculineDem = dem === 'זה';
    if (!feminineDem && !masculineDem) continue;

    let j = i + 1;
    while (j < toks.length && AGREEMENT_SKIP.has(toks[j])) j++;
    if (j >= toks.length) continue;

    const noun = stripHe(toks[j]);
    if (feminineDem && MASC_NOUNS.has(noun)) {
      return `"${dem} ${toks[j]}" does not agree: ${noun} is masculine, so it is "זה ${toks[j]}". Agree with the noun, not with her.`;
    }
    if (masculineDem && FEM_NOUNS.has(noun)) {
      return `"${dem} ${toks[j]}" does not agree: ${noun} is feminine, so it is "זו ${toks[j]}". Agree with the noun, not with her.`;
    }
  }
  return '';
}

/*
 * The 13 emotional drivers. Each video is built on exactly one of them so the
 * emotional through-line stays sharp instead of muddling five feelings at once.
 * `angle` is what goes into the writing prompt.
 *
 * `regulation` and `sensitivity` were added on 2026-09-18 with the avatar. The
 * other eleven are all about getting things done, and she named moods as her
 * FIRST problem, ahead of finishing anything. A feed that never once names the
 * feeling is a feed about two thirds of her.
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
    key: 'regulation',
    name: 'הגל',
    angle: 'The mood itself, treated as part of the same wiring and not as a separate personal failing. One concrete wave: the morning that was fine until it was not, boredom arriving as physical restlessness, the flat hour after a day where everything finally worked, a feeling arriving at full volume with no dimmer between nothing and everything. Explain that an ADHD brain regulates attention and feeling with the same machinery, so a day that drains one drains the other. Then one small thing that helps ride it. Never call her dramatic, unstable or too much. Never suggest the feeling is a choice. The feeling to produce is "so it is not that I am broken, it is that it comes in at full volume".',
  },
  {
    key: 'sensitivity',
    name: 'רגישות',
    angle: 'Rejection sensitivity, named plainly and without the clinical word. A short message read forty times, a tone of voice that ruined a whole afternoon, a group chat gone quiet, the certainty that someone is angry when they are simply busy. Explain that the reaction is real and physical and arrives before any thinking happens, so "do not take it personally" was never advice she could use. Give one thing that shortens the spiral by a few minutes. The feeling is being understood about the part she is most embarrassed by.',
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
 * The closing call to action, in the founder's own words, moved to the singular
 * feminine on 2026-09-18 along with the rest of the account. The structure, the
 * offer and the line breaks are exactly as she specified them; only the person
 * being spoken to changed, because sixty seconds written to one woman cannot
 * close by addressing a crowd.
 *
 * TWO WORDS WERE REWRITTEN RATHER THAN CONVERTED, and this is the reason:
 * "אם הגעתם עד לכאן" becomes "אם את עדיין כאן", and "רוצים לקבל" becomes "את
 * רוצה". The direct conversions, הגעת and רוצה, are spelled identically for
 * both genders — the choice only exists out loud, and an unvocalised script
 * hands it to the TTS, which picks wrong often enough that it already happened
 * twice on the promo reel. This card plays at the end of every single video, so
 * a masculine reading of it would be the most repeated mistake on the account.
 * את, תגיבי, וקבלי and כנסי can each be read one way only.
 *
 * Instagram gets the comment CTA (comments are the goal, and a comment can be
 * answered with a DM). TikTok and YouTube have no reliable comment-to-DM path,
 * so they send people to the profile link instead.
 */
const CTA = {
  // Instagram's close is a three line end card, break for break as the founder
  // specified. `card: true` exempts it from the one line and 4 to 6 word rules
  // — the last line is a single word on purpose. That exemption applies to the
  // closing card only, never to a translation line.
  instagram: [
    {
      he: 'תגיבי "אני" אם את עדיין כאן,\nוקבלי 7 ימי ניסיון באפליקציה\nבחינם 👇',
      en: 'Comment the word me if you are still here, and get seven free trial days inside the app.',
      card: true,
    },
  ],
  // TikTok and YouTube close on their own card: two lines, a blank line, then
  // one line. Also specified break for break.
  tiktok: [
    {
      he: 'את רוצה 7 ימי ניסיון\nבאפליקציה בחינם?\n\nכנסי לקישור בפרופיל שלנו.',
      en: 'Do you want seven free trial days inside the app? Go to the link in our profile.',
      card: true,
    },
  ],
  youtube: [
    {
      he: 'את רוצה 7 ימי ניסיון\nבאפליקציה בחינם?\n\nכנסי לקישור בפרופיל שלנו.',
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
  MIN_FEMININE_LINES,
  AVATAR,
  MOTIVATORS,
  CTA,
  CTA_QUERIES,
  DIET_WORDS,
  mentionsDiet,
  prescribes,
  disagrees,
  stripEmoji,
  countWords,
  lineIsLegal,
  dodgesHer,
  carriesFeminineMark,
  countFeminine,
  tokens,
};
