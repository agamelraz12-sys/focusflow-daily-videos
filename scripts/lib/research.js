'use strict';
/*
 * research.js — what the account is allowed to KNOW, and which part of her life
 * each video is about.
 *
 * Added 2026-09-20 on the founder's instruction: every post is for women with
 * ADHD, and the content has to cover her whole life — relationships, work,
 * health and food — not only her to-do list.
 *
 * Two things live here and they solve two different problems.
 *
 * 1. PILLARS answer "what is this video about". Before this file the writer was
 *    given an emotional driver and nothing else, so it wrote about the same
 *    territory every time: an unstarted task and a mood. Thirteen drivers over
 *    one subject is thirteen ways to say the same thing. A pillar names the
 *    part of her life the scene comes from, and the rotation guarantees the
 *    feed actually visits all of it.
 *
 * 2. FACTS answer "what may this video claim". The house rules already forbid
 *    inventing precise sounding figures, which is right — a viewer who
 *    disproves one number stops believing all of them. But a blanket ban left
 *    the writer with nothing but feelings, and the single most useful thing
 *    this account can give a woman who spent twenty years being told she was
 *    careless is a real finding with a real source behind it. So the ban is now
 *    narrower and stronger: a number may be stated ONLY if it came from this
 *    file, and the validator checks it.
 *
 * WHY THE SOURCE IS RECORDED FOR EVERY SINGLE ENTRY. A fact in here will be
 * spoken out loud to thousands of women who have been failed by confident
 * people before. When one is challenged in the comments there has to be an
 * answer, and when one turns out to be wrong there has to be a way to find
 * every video that used it.
 *
 * THE TIER SYSTEM, WHICH IS THE POINT OF THE FILE.
 *   citable: true   the number was read out of the primary source and may be
 *                   said out loud.
 *   citable: false  the finding is real and the direction is well supported,
 *                   but the figure reached me through a secondary source and
 *                   was not verified at the source. The idea may be used. The
 *                   NUMBER MAY NOT. This is most of the popular ADHD statistics
 *                   on the internet, and it is why "91.6% of adults mask" is in
 *                   here without its number.
 *
 * Flags that change how a fact may be spoken:
 *   medical: true   touches medication, supplements or a test. May be reported
 *                   as something researchers found. May never become advice,
 *                   and may never suggest starting, stopping or changing
 *                   anything she takes.
 *   frame           a fact that can hurt if said carelessly carries its own
 *                   instruction for how to say it. Read it as binding.
 */

/*
 * ---------------------------------------------------------------- PILLARS ---
 *
 * Seven parts of her life. The founder named four of them (relationships,
 * work, health, food); the other three are what the account was already doing
 * well and would have lost if the rotation only contained the new ones.
 *
 * `scenes` matter more than they look. A pillar without concrete moments
 * produces a lecture about the topic — "relationships are hard with ADHD" —
 * which is worth nothing. The scenes force the writer down to the level where
 * a woman recognises her own Tuesday. They are examples to think from, not a
 * list to pick from, and a video that reuses one word for word is a video that
 * has already been made.
 *
 * `neverSay` is not decoration either. Each one is a true thing that would
 * damage her if said. The work pillar knows there is no Americans with
 * Disabilities Act here and that telling a woman to disclose her diagnosis at
 * work is advice with a real cost attached. The food pillar knows this
 * audience has a raised rate of binge eating and that a diet video aimed at
 * her is not a neutral mistake.
 */
const PILLARS = [
  {
    key: 'relationships',
    he: 'זוגיות ואנשים',
    scope: [
      'Her relationships: a partner, dating, friends, family, the people at the',
      'school gate. How ADHD actually shows up between two people rather than',
      'inside her head.',
    ].join(' '),
    scenes: [
      'the message she read, composed a full reply to in her head, and never sent',
      'a partner asking why she is upset and her not being able to name it yet',
      'the third time this week he asked whether she called the plumber',
      'a friend who stopped writing and nine days of certainty that she did something',
      'hearing one flat word in a voice note and rereading the whole day through it',
      'talking over someone because the thought would be gone in four seconds',
      'the birthday she remembered on the day, every year, always on the day',
      'being completely present for one hour and absent for the next three',
      'apologising for something small in far too many words',
      'a shared calendar invitation she accepted and never once saw again',
    ],
    neverSay: [
      'Never suggest she is a burden to the person who loves her, or that her',
      'partner is heroic for staying. Never advise her to leave or to stay.',
      'Never tell her to just communicate better, she has heard it. Never imply',
      'the relationship is hers alone to hold together.',
    ].join(' '),
  },
  {
    key: 'work',
    he: 'עבודה',
    scope: [
      'Her working life: a job, a shift, studies, her own business. The gap',
      'between what she can do and what the day around her is shaped like.',
    ].join(' '),
    scenes: [
      'an email of four lines that took eleven days and four minutes',
      'rehearsing the sentence before saying it in a meeting, then not saying it',
      'the hardest hour of the week being the boring twenty minute task',
      'delivering something brilliant at two in the morning of the day it was due',
      'arriving early so nobody would ever know how close it was',
      'a manager calling her inconsistent and both of them being right',
      'the folder named to sort that has been on the desktop for two years',
      'taking work home to do quietly what everyone else did in the office',
      'being the one who solved the impossible thing and forgot the weekly report',
      'a job she was good at that she left because of everything around the job',
    ],
    neverSay: [
      'Never advise her to tell her employer she has ADHD as though it were a',
      'free move. There is no protection here that makes that safe and she is',
      'the one who pays if it goes wrong. Never suggest she simply find an',
      'easier job or work for herself. Never call her a bad employee, and never',
      'call ADHD a professional advantage.',
    ].join(' '),
  },
  {
    key: 'health',
    researchMatters: true,
    he: 'בריאות וגוף',
    scope: [
      'Her body: sleep, movement, the cycle and the hormones behind it, pain,',
      'doctors, the appointments that never get made, medicine she may or may',
      'not take. This pillar is where the research about WOMEN with ADHD',
      'specifically lives, because almost all of it is physical.',
    ].join(' '),
    scenes: [
      'awake at one in the morning, not sad, not busy, simply not sleepy yet',
      'a week every month where the same work costs twice as much',
      'the referral that expired before the appointment was ever made',
      'a doctor explaining anxiety to her for the ninth year',
      'holding her whole body still through a meeting and being wrecked after',
      'the walk that fixes an afternoon, taken roughly twice a year',
      'a prescription she never collected sitting in the pharmacy',
      'the hour of scrolling that was meant to be the reward for going to bed',
      'noticing at four that the ache all day was that she never drank water',
    ],
    neverSay: [
      'Never give medical advice and never sound like a doctor. Never tell her',
      'to start, stop or change any medicine or supplement. Never diagnose her.',
      'Never tell her what her hormones mean about today: a group average',
      'delivered to one woman in the morning is a horoscope, and she then lives',
      'it. Describe what researchers found in many women and let her check it',
      'against her own month. Never promise a symptom will go away.',
    ].join(' '),
  },
  {
    key: 'food',
    researchMatters: true,
    he: 'אוכל',
    scope: [
      'Eating, with an ADHD brain and an ordinary life around it. Not a diet,',
      'not a body. The subject is how food actually happens on a day when',
      'nothing else does, and what the research says about this brain and food.',
    ].join(' '),
    scenes: [
      'realising at four that today has had coffee in it and nothing else',
      'a fridge with ingredients in it and nothing she can imagine making',
      'eating standing up over the sink in ninety seconds, hungry again at nine',
      'the vegetables bought with real intention, thrown out soft two weeks later',
      'the whole packet finished while she was thinking about something else',
      'being unable to start cooking and unable to bear another delivery',
      'twelve tabs of recipes and dinner that was bread',
      'the same three meals for four months and then never that meal again',
      'eating at eleven at night because that was the first quiet hour',
    ],
    neverSay: [
      'Never a diet. Never calories, never weight, never losing or gaining,',
      'never clean eating, never good foods and bad foods, never a before and',
      'after. Women with ADHD have a markedly raised rate of binge eating and',
      'disordered eating, which is exactly why food content aimed at her must',
      'never become diet content: the audience most likely to be harmed by it',
      'is precisely the audience watching. Never shame her for what or when she',
      'ate. Food here is about energy, and about getting fed at all.',
    ].join(' '),
  },
  {
    key: 'womanhood',
    researchMatters: true,
    he: 'להיות אישה עם ADHD',
    scope: [
      'What is specific to being a WOMAN with this, and it is a great deal: the',
      'diagnosis that came fifteen years late or has not come at all, the girl',
      'who was quiet and dreamy and therefore invisible, the work of appearing',
      'fine, and the bill that work comes with.',
    ].join(' '),
    scenes: [
      'a school report that said bright, could try harder, and nothing else ever',
      'the phrase but you seem so organised, said as a compliment',
      'her son assessed, and something in the questionnaire describing her exactly',
      'crying in the car at thirty nine over a diagnosis and not knowing why',
      'systems copied off other women that worked for three weeks each',
      'the checklists and the colour codes that hid it for twenty years',
      'being called sensitive, dramatic, lazy and bright, often in one year',
      'the exhaustion of a day in which nothing visible went wrong',
    ],
    neverSay: [
      'Never suggest she must get diagnosed or medicated to matter. Assessment',
      'costs money and a long wait and not everyone can reach it. Never imply a',
      'woman without a formal diagnosis does not really have this. Never turn',
      'the late diagnosis into a triumph story. Never blame her mother.',
    ].join(' '),
  },
  {
    key: 'mood',
    he: 'רגשות',
    scope: [
      'The feeling itself. The founder named moods as her first problem, ahead',
      'of finishing anything, and this pillar is what keeps that promise.',
    ].join(' '),
    scenes: [
      'a good morning that is gone by noon with no event in between',
      'boredom arriving in the legs rather than in the mind',
      'the flat grey hour after a day when everything finally worked',
      'a small comment at ten that is still being carried at four',
      'nothing, then everything, with no dial between them',
      'the shame that comes with the second hour of not being able to move',
      'being told to calm down while already trying with everything she has',
    ],
    neverSay: [
      'Never call her dramatic, unstable, too sensitive or too much. Never imply',
      'the feeling is a decision she is making. Never tell her to think',
      'positively.',
    ].join(' '),
  },
  {
    key: 'daily',
    he: 'היום יום',
    scope: [
      'The ordinary machinery of an adult life: the form, the appointment, the',
      'laundry, the bank app, the nine things open at eighty percent. This is',
      'what the account did before the other pillars existed and it still works.',
    ].join(' '),
    scenes: [
      'the form open in a tab for eleven days that takes four minutes',
      'laundry that reached the chair and lives there now',
      'a bank app not opened since something in it became frightening',
      'a five minute phone call carried around for three weeks',
      'nine tabs, each one eighty percent finished',
      'the keys, always, every single time',
      'a shopping list written beautifully and left on the table',
      'starting to tidy the room and finding the box of photographs',
    ],
    neverSay: [
      'Never imply she is lazy, messy, careless or behind. Never hand her a',
      'system that needs her to already be organised in order to get organised.',
    ].join(' '),
  },
];

/*
 * ------------------------------------------------------------------ FACTS ---
 *
 * Everything the account is allowed to assert. Read the tier rules at the top
 * of this file before adding one.
 *
 * `claim` is written in precise English for the model to work from, not in the
 * Hebrew it will be spoken in. That is deliberate: a Hebrew phrasing in here
 * gets copied word for word into video after video, and the whole feed starts
 * to sound like a leaflet. The writer translates it into third grade Hebrew
 * itself, differently every time.
 *
 * `numbers` lists every figure the writer may say out loud for that fact. The
 * validator reads this array, so a number that is not in it cannot reach a
 * video even if the model is certain of it.
 */
const FACTS = [
  // ---------------------------------------------------------- womanhood ---
  {
    id: 'dx-gap',
    pillars: ['womanhood', 'work', 'mood'],
    claim: [
      'Women are diagnosed with ADHD years later than men even though the symptoms',
      'start at the same age. In Swedish national register data women were diagnosed',
      'at 23.5 years on average and men at 19.6. A Spanish clinical sample of 900',
      'patients found 28.96 years for women and 24.13 for men. The delay is not',
      'because it arrived late. It is because nobody looked.',
    ].join(' '),
    numbers: ['23.5', '19.6', '28.96', '24.13', '900'],
    citable: true,
    source: 'Skoglund et al., Swedish national registers; Amoretti et al., n=900 (presented at ECNP 2025)',
  },
  {
    id: 'dx-gap-cost',
    pillars: ['womanhood', 'mood'],
    claim: [
      'In the same Swedish register data, women with ADHD were about twice as likely',
      'as men with ADHD to also be diagnosed with an anxiety disorder (50.4% versus',
      '25.9%) and with a mood disorder (37.5% versus 19.5%). Those years without a',
      'name for it are not free years.',
    ].join(' '),
    numbers: ['50.4', '25.9', '37.5', '19.5'],
    citable: true,
    source: 'Skoglund et al., Swedish national register study',
    frame: [
      'This is the cost of being missed, not a prediction about her. Never present',
      'anxiety or depression as something she is heading for.',
    ].join(' '),
  },
  {
    id: 'masking',
    pillars: ['womanhood', 'work', 'relationships'],
    claim: [
      'Most adults with ADHD report hiding or compensating for it in front of other',
      'people: rehearsing sentences, over preparing, checking three times, copying',
      'someone else system, arriving early. Research on camouflaging finds it uses',
      'the very attention and working memory the task itself needs, and that higher',
      'camouflaging goes with lower life satisfaction and more depressive symptoms.',
      'It is a second unpaid job running underneath the first one, and it is a large',
      'part of why women get missed.',
    ].join(' '),
    numbers: [],
    citable: false,
    source: 'Camouflaging and compensation literature in ADHD and autism; widely quoted survey figures not verified at source, so no number here',
  },
  {
    id: 'late-dx-relief',
    pillars: ['womanhood'],
    claim: [
      'Qualitative studies of women diagnosed in adulthood describe the same turn:',
      'the diagnosis does not add a problem, it reorganises a life of evidence she',
      'had been reading as proof of her own character.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Qualitative research with late-diagnosed women (Scientific Reports 2025; UK interview studies)',
  },

  // ------------------------------------------------------------- health ---
  {
    id: 'estrogen-dopamine',
    pillars: ['health', 'mood', 'womanhood'],
    claim: [
      'Estrogen supports the dopamine system, and dopamine is the system ADHD',
      'already runs short on. So when estrogen falls in the second half of the',
      'cycle, attention, impulse control and emotional regulation get measurably',
      'harder. Reviews of the studies in women with ADHD find the hardest days',
      'cluster in the late luteal phase and during menstruation, and the easiest',
      'in the mid follicular phase. The same work is genuinely costing her more',
      'that week. It is a hormone curve, not a character.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Narrative review, menstrual-cycle hormonal fluctuations in ADHD and cognition (2025)',
    frame: [
      'Describe what was found across many women and let her check it against her',
      'own month. Never tell her what today will be like for her. A group average',
      'delivered as a forecast becomes true by being read.',
    ].join(' '),
  },
  {
    id: 'pmdd',
    pillars: ['health', 'mood'],
    claim: [
      'Premenstrual dysphoric disorder is far more common in women with ADHD. In a',
      'study of 715 women aged 18 to 34, 31.4% of those with an ADHD diagnosis met',
      'the criteria for provisional PMDD against 9.8% of women without ADHD, which',
      'is about three times the risk. PMDD is not a bad mood before a period. It is',
      'a week where the floor goes.',
    ].join(' '),
    numbers: ['715', '31.4', '9.8', '3'],
    citable: true,
    source: 'Broughton, Lambert, Wertz & Agnew-Blais, British Journal of Psychiatry, 2025, n=715, RR 3.19',
    frame: 'Never diagnose her with it. Name it so she can take it to a doctor.',
  },
  {
    id: 'perimenopause',
    pillars: ['health', 'womanhood'],
    claim: [
      'Estrogen falls through the forties, and with it the support the dopamine',
      'system was getting. Women with ADHD report a much harder time of',
      'perimenopause than women without it, and a striking share of women are',
      'diagnosed for the first time in their forties, when the coping that had held',
      'for twenty years stops holding. A woman who says she got worse at forty two',
      'is describing something real.',
    ].join(' '),
    numbers: [],
    citable: false,
    source: 'Perimenopause and ADHD literature; the survey percentages circulating for this were not verified at source, so no number here',
  },
  {
    id: 'sleep-delay',
    pillars: ['health', 'daily'],
    claim: [
      'This is a body clock, not a discipline problem. In adults with ADHD and',
      'trouble falling asleep, the evening release of melatonin starts around 90',
      'minutes later than it does in other people, and roughly three quarters of',
      'adults who had ADHD as children show an objectively delayed clock. She is',
      'not choosing to be awake at one in the morning. Her body has not been told',
      'yet that it is night.',
    ].join(' '),
    numbers: ['90'],
    citable: true,
    source: 'Van Veen et al., Biological Psychiatry 2010; circadian reviews in ADHD',
  },
  {
    id: 'sleep-light',
    pillars: ['health', 'daily'],
    claim: [
      'In a randomised trial with adults who had ADHD and a delayed body clock,',
      'low dose melatonin moved the clock about 1.5 hours earlier and cut ADHD',
      'symptoms by around 14%, and melatonin together with bright morning light',
      'moved it about 2 hours. The part of this that costs nothing and needs no',
      'pharmacy is the light: daylight on her face early shifts the same clock.',
    ].join(' '),
    numbers: ['1.5', '14', '2'],
    citable: true,
    source: 'van Andel et al., chronotherapy RCT, Journal of Biological Rhythms 2022 / Chronobiology International 2021',
    medical: true,
    frame: [
      'Report the trial, recommend nothing. May point at morning daylight, which',
      'is not a drug. May NEVER tell her to take melatonin or any dose of it.',
    ].join(' '),
  },
  {
    id: 'exercise',
    pillars: ['health', 'mood', 'daily'],
    claim: [
      'Movement is the one self help answer that actually holds up in the data for',
      'this brain. Meta analyses find physical activity improves executive function',
      'in people with ADHD, and that ordinary cardio, walking and cycling included,',
      'reduces inattention and impulsivity. The proposed reason is that it raises',
      'dopamine and noradrenaline, the same two chemicals the medicines act on.',
      'The useful dose is the walk she will actually take, not a training plan.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Meta-analyses of physical activity and executive function in ADHD; JOGH 2025 review on inhibitory control in adult ADHD',
  },
  {
    id: 'chronic-pain',
    pillars: ['health'],
    claim: [
      'A prospective study of women with ADHD and autism found long term pain to be',
      'common among them and linked to markedly lower quality of life. A woman with',
      'ADHD who is also always aching is not two unrelated stories.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Prospective longitudinal study, chronic pain and quality of life in women with autism and/or ADHD (2019)',
  },
  {
    id: 'pcos',
    pillars: ['health', 'womanhood'],
    claim: [
      'Women with polycystic ovary syndrome show higher levels of ADHD symptoms than',
      'women without it, and researchers are now looking at ADHD alongside PMDD,',
      'PCOS and endometriosis rather than separately from them. Her hormones and her',
      'attention are being handled by two clinics that do not speak to each other.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Hergüner et al. 2015, ADHD symptoms in women with PCOS; 2025 review of hormonal interplay in female ADHD',
  },

  // --------------------------------------------------------------- food ---
  {
    id: 'binge',
    pillars: ['food', 'mood'],
    claim: [
      'Eating in a way she cannot stop is a known part of this, not a separate',
      'weakness. Women with ADHD score higher on binge eating measures than matched',
      'women without it, and binge eating disorder is found in roughly 8% of people',
      'with ADHD. The shared machinery is impulse control and emotional regulation,',
      'the same machinery that loses the tab and the temper.',
    ].join(' '),
    numbers: ['8'],
    citable: true,
    source: 'Cross-sectional study of ADHD and binge eating in adult women (Women, 2025); ADHD and eating disorder comorbidity reviews',
    frame: [
      'This is the single most dangerous fact in the file. Use it ONLY to remove',
      'shame and never as a reason to control what she eats. No diet, no weight,',
      'no calories, not one word about her body. If a line could appear on a',
      'weight loss account it is wrong and the whole video is wrong.',
    ].join(' '),
  },
  {
    id: 'forgot-to-eat',
    pillars: ['food', 'daily'],
    claim: [
      'Not noticing hunger until it is four in the afternoon is interoception, the',
      'sense that reports the inside of the body, and it runs quietly worse in ADHD',
      'alongside the sense of time. Hyperfocus removes the signal completely. Then',
      'the crash at four is read as a mood or a personal failing when it is a body',
      'that has had coffee since morning.',
    ].join(' '),
    numbers: [],
    citable: false,
    source: 'Interoception and ADHD literature; well described clinically, no clean prevalence figure verified',
  },
  {
    id: 'ferritin',
    pillars: ['food', 'health'],
    claim: [
      'Iron is used to build dopamine, and ferritin is the blood test for how much',
      'iron is in store. Low ferritin goes with more severe ADHD symptoms, and in',
      'children with low ferritin twelve weeks of iron improved the symptoms. The',
      'adult evidence is thinner. This matters for women in particular because',
      'monthly bleeding is the most common reason for low iron in the world, and a',
      'normal blood count can sit on top of an empty iron store.',
    ].join(' '),
    numbers: ['12'],
    citable: true,
    source: 'Ferritin and ADHD symptom severity literature; paediatric iron supplementation trial',
    medical: true,
    frame: [
      'May say the test exists and that it is cheap and ordinary. May NEVER tell',
      'her to take iron. Iron without a deficiency is harmful, and only a blood',
      'test knows. The move is asking her doctor, never the pharmacy shelf.',
    ].join(' '),
  },
  {
    id: 'omega3',
    pillars: ['food', 'health'],
    claim: [
      'Across eight studies, six found people with ADHD had lower omega 3 levels or',
      'a worse omega 6 to omega 3 balance. Supplement trials show small improvements',
      'in attention, and the improvement shows up mainly in people who were actually',
      'low to begin with. Small and real is the honest description, and it is not a',
      'replacement for anything.',
    ].join(' '),
    numbers: ['8', '6', '3'],
    citable: true,
    source: 'Review of omega-3 status in ADHD (6 of 8 studies); supplementation meta-analyses',
    medical: true,
    frame: 'Report the finding. Never prescribe a supplement or a dose.',
  },

  // ------------------------------------------------------ relationships ---
  {
    id: 'rsd',
    pillars: ['relationships', 'mood', 'work'],
    claim: [
      'The reaction to being rejected, or to thinking she has been, arrives before',
      'any thinking does. It is physical and it is fast, which is exactly why do',
      'not take it personally was never advice she could use. Emotional regulation',
      'is now treated as part of adult ADHD rather than a side effect of it, and',
      'this sensitivity is reported more often by women with ADHD than by men.',
      'What helps is not feeling it less. It is knowing what it is while it happens,',
      'and not sending anything for twenty minutes.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Rejection sensitivity in ADHD, qualitative and survey literature; emotional dysregulation in the European adult ADHD criteria',
  },
  {
    id: 'couples',
    pillars: ['relationships'],
    claim: [
      'Couples where one partner has ADHD report more conflict and lower',
      'satisfaction on average, and the pattern that does the damage is specific:',
      'one person drifts into managing and the other into being managed, and both',
      'of them resent it. The research points at the pattern, not at her.',
    ].join(' '),
    numbers: [],
    citable: false,
    source: 'Canu & Carlson 2007 and subsequent couples research; the widely circulated divorce and partner-survey percentages were not verified at source',
    frame: [
      'There are real figures in this literature about how the non ADHD partner',
      'feels and they are forbidden here. Quoting them to her is telling a woman',
      'that research has measured how tiring she is. Describe the pattern the two',
      'of them are in. Never put her on one side of it alone.',
    ].join(' '),
  },
  {
    id: 'mothers',
    pillars: ['relationships', 'mood'],
    claim: [
      'Research on mothers with ADHD finds the hard part is not the logistics, it is',
      'responding to a child who is having a huge feeling while she is having one',
      'too, because both run on the same regulation. The studies name the gap',
      'between what she meant to do and what happened, and the guilt that lives in',
      'that gap, as the central experience. ADHD is also a known risk factor for',
      'depression after birth, and it is under recognised.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Journal of Attention Disorders, maternal ADHD symptoms and emotional dysregulation in parenting; perinatal ADHD literature',
    frame: [
      'Never suggest she is harming her children. Never write a line that only',
      'makes sense to a mother: this fact belongs in a video that chose that',
      'scene, and the account is not only for mothers.',
    ].join(' '),
  },

  // --------------------------------------------------------------- work ---
  {
    id: 'work-women',
    pillars: ['work', 'womanhood'],
    claim: [
      'Interviewed about their working lives, women with ADHD described the',
      'workplace as confusing, overwhelming and chaotic, and described holding it',
      'together out of sight: preparing far more than anyone knew, doing at home',
      'what others did at their desk. Employment research finds more job changes',
      'and lower average earnings, and separately that the right fit between a',
      'person and a job changes the outcome more than any single technique does.',
      'Some of what she calls failing at work is a room that was never built for',
      'her brain.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Schreuer & Dorot, Work, 2017, phenomenological study of employed women with ADHD; systematic review of ADHD in employment, 2024',
  },
  {
    id: 'boring-not-hard',
    pillars: ['work', 'daily'],
    claim: [
      'This brain runs on interest, novelty, challenge and urgency rather than on',
      'importance, which is why the twenty minute boring task is genuinely harder',
      'to start than the four hour difficult one. It is not a willingness problem.',
      'The system that hands out effort is not reading the word important.',
    ].join(' '),
    numbers: [],
    citable: true,
    source: 'Interest-based nervous system / motivation in ADHD, clinical literature',
  },
  {
    id: 'time-blind',
    pillars: ['daily', 'work'],
    claim: [
      'Losing time is measurable in a laboratory, not a story she tells about',
      'herself. A meta analysis across timing tasks found people with ADHD are',
      'consistently worse at reproducing how long something lasted, across 26',
      'studies and 2,364 people, and at telling two durations apart, across 25',
      'studies and 1,633 people. Five more minutes is not a lie she is telling. It',
      'is a reading off a clock that runs differently.',
    ].join(' '),
    numbers: ['26', '2364', '2,364', '25', '1633', '1,633'],
    citable: true,
    source: 'Meta-analysis of time perception in ADHD (55 studies across four timing domains)',
  },
  {
    id: 'body-double',
    pillars: ['work', 'daily'],
    claim: [
      'Doing the task next to another person, in the room or on an open video call,',
      'is the thing women with ADHD most often say unlocks it. Be honest about the',
      'evidence: it is thin. Small studies find tasks finished faster and attention',
      'held longer with someone else present, and most of the support for it is',
      'people reporting that it works. Worth trying, not proven.',
    ].join(' '),
    numbers: [],
    citable: false,
    source: 'Small body-doubling studies and reported experience; no large trial exists',
    frame: 'Say plainly that the research here is thin. Honesty about weak evidence is the asset.',
  },
];

/*
 * -------------------------------------------------- spotting a claim -------
 *
 * How the validator tells a line that ASSERTS RESEARCH apart from a line that
 * merely contains a number. It has to, because most numbers in good copy here
 * are scene numbers — the form open for eleven days, the first sixty seconds,
 * nine days of silence — and a flat ban on digits would delete the most
 * concrete writing on the account. That is the same mistake as the Hebrew
 * blocklist this codebase already got wrong twice: a rule that rejects good
 * copy gets switched off, and then it guards nothing.
 *
 * So two narrower rules, each aimed at a different failure:
 *
 *   strong marker   the line invokes science (מחקר, חוקרים, הוכח). A script
 *                   that does this must name the finding it used. This catches
 *                   authority borrowed from nobody.
 *   digits          on a line that is making a numeric claim, the figures must
 *                   come from the library. This catches the invented statistic.
 *
 * A KNOWN AND DELIBERATE GAP: a percentage written out in Hebrew words rather
 * than digits ("שמונים אחוז") is not checked, because "nine things open at
 * eighty percent" is an idiom this account uses and should keep. Closing that
 * gap costs more good copy than it saves bad.
 */
const STRONG_MARKERS = [
  'מחקר', 'מחקרים', 'במחקר', 'ממחקר', 'מחקרית', 'המחקר', 'והמחקר',
  'חוקרים', 'חוקרות', 'מדענים', 'מדעניות', 'הוכח', 'הוכיחו', 'מוכח',
  'סקר', 'נבדקו', 'סטטיסטיקה', 'מדע',
];

const NUMERIC_MARKERS = ['אחוז', 'אחוזים', '%', 'מתוך', 'פי', 'ממוצע', 'בממוצע'];

function normaliseNumber(n) {
  return String(n).replace(/,/g, '');
}

// Digit groups only. 31.4 stays one number, 2,364 becomes 2364.
function numbersIn(text) {
  return (String(text || '').match(/\d+(?:[.,]\d+)*/g) || []).map(normaliseNumber);
}

function claimsResearch(text, tokenList) {
  const toks = tokenList || String(text || '').replace(/[.,!?;:"'״׳()]/g, ' ').split(/\s+/).filter(Boolean);
  const strong = STRONG_MARKERS.some((m) => toks.includes(m));
  const numeric = NUMERIC_MARKERS.some((m) => toks.includes(m)) || /%/.test(String(text || ''));
  return { strong, numeric };
}

// ------------------------------------------------------------------ api ----

const PILLAR_KEYS = PILLARS.map((p) => p.key);

function factById(id) {
  return FACTS.find((f) => f.id === id) || null;
}

function pillarByKey(key) {
  return PILLARS.find((p) => p.key === key) || null;
}

/*
 * The facts offered to one video. Facts tagged with the pillar come first; the
 * rest of the library is offered behind them so a video can reach for a related
 * finding without being restricted to its own shelf.
 *
 * `avoidIds` carries the facts used in the last few videos. Without it the
 * writer reaches for the same two strong findings every time — the PMDD figure
 * is the most quotable thing in the file and would otherwise be in a third of
 * the feed.
 */
function factsFor(pillarKey, { limit = 4, avoidIds = [] } = {}) {
  const avoid = new Set(avoidIds);
  const mine = FACTS.filter((f) => f.pillars.includes(pillarKey));
  const fresh = mine.filter((f) => !avoid.has(f.id));
  const stale = mine.filter((f) => avoid.has(f.id));
  return [...fresh, ...stale].slice(0, limit);
}

// Every number the writer is allowed to say out loud in this video. A fact that
// is not citable contributes nothing here even though its claim is on offer.
function allowedNumbers(facts) {
  const out = new Set();
  facts.forEach((f) => {
    if (!f || !f.citable) return;
    (f.numbers || []).forEach((n) => out.add(normaliseNumber(n)));
  });
  return out;
}

/*
 * Which of a fact's numbers are actually PERCENTAGES.
 *
 * The permitted-numbers check alone has a hole worth closing. `time-blind`
 * legitimately permits 26, because its claim says the meta analysis covered 26
 * studies. Nothing in a flat list of digits stops that 26 being spoken as
 * "26 אחוז מהנשים", which is a fabricated statistic wearing a real number.
 *
 * So a figure said as a percentage must have BEEN a percentage in the source.
 * Read them straight out of the claim text rather than maintaining a second
 * list by hand, because a hand list is a list that drifts from the claim it
 * describes and then guards nothing.
 */
function percentNumbers(facts) {
  const out = new Set();
  facts.forEach((f) => {
    if (!f || !f.citable) return;
    const hits = String(f.claim).match(/(\d+(?:[.,]\d+)*)\s*%/g) || [];
    hits.forEach((h) => out.add(normaliseNumber(h.replace(/\s*%$/, ''))));
  });
  return out;
}

/*
 * Small round numbers are allowed on a claim line whatever the facts say.
 *
 * Without this the validator rejects ordinary Hebrew: "פי שניים", "שלוש מתוך
 * ארבע פעמים", "המחקר בדק 2 קבוצות". These are not statistics being smuggled
 * in, they are how a person counts, and a number this small is not the kind of
 * fake precision the rule exists to stop. "One small delay costs 1,000 shekels"
 * is the failure mode, and it survives this exemption untouched.
 */
const TRIVIAL_NUMBERS = new Set(['1', '2', '3', '4', '5', '10', '100']);

module.exports = {
  PILLARS,
  PILLAR_KEYS,
  FACTS,
  TRIVIAL_NUMBERS,
  pillarByKey,
  factById,
  factsFor,
  allowedNumbers,
  percentNumbers,
  numbersIn,
  claimsResearch,
  normaliseNumber,
};
