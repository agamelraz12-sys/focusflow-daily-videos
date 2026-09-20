---
name: daily-videos
description: >
  Writes, renders and schedules 6 brand new short videos every day to Instagram Reels,
  TikTok and YouTube Shorts through the Buffer API, unattended via GitHub Actions.
  Every script is generated fresh (nothing ever repeats), narrated in English with
  Hebrew subtitles, and built to break a limiting belief about self discipline and
  drive comments and profile clicks. Use this skill for any request to set up, run,
  fix or change the daily video automation. Triggers on "תעלה סרטונים", "תזמן סרטונים",
  "הרץ את הסרטונים", "daily videos", "instagram automation", "buffer scheduling".
---

# Daily videos

Six videos a day, every day, without the founder's computer being on.

Each one is written from scratch by an AI writer, rendered to a 1080x1920 MP4 with
English narration and Hebrew subtitles, uploaded to a GitHub Release, and booked into
Buffer for Instagram, TikTok and YouTube Shorts.

---

## The rules the content obeys

These are enforced in code, not left to the model's good intentions.

| Rule | Where it is enforced |
| --- | --- |
| A subtitle is on screen **only while the narrator is saying that line** | `render_video.js` uses TTS word boundaries (`speakStart`/`speakEnd`), never the clip boundaries |
| **One line** per subtitle, never two or three | `copy_rules.lineIsLegal` rejects any line break |
| **4 to 6 words** per Hebrew line, no exceptions | `copy_rules.countWords`, checked in the generator *and* again at render time |
| The clip **cuts exactly when the subtitle changes** | clip boundaries are set from the same `speakStart` values |
| There is **always** background music | `render_video.js` throws if no bed is supplied |
| The **profile grid tile shows a caption**, never a silent frame | `render_video.js` picks a frame from inside a caption window and writes it to `video.cover.json`; `schedule_buffer.js` passes it as `thumbnailOffset` |
| Every line speaks to **one woman**, third grade Hebrew, no dashes | prompt rules plus `copy_rules.dodgesHer`, which rejects masculine address and plural address, and a dash check |
| At least 3 lines per script are unmistakably feminine **out loud** | `copy_rules.countFeminine`, checked on the whole script in `validate` |
| A demonstrative agrees with **the noun**, not with her | `copy_rules.disagrees` — "זו לא חוסר הקשבה" is wrong because חוסר is masculine, and the model makes this slip precisely because everything else is feminine |
| A number spoken as research **came from a real study** | `research.js` holds every permitted figure; `validate` rejects any other number on a line that is making a claim |
| **Never diet talk**, in any video, on any subject | `copy_rules.mentionsDiet`, checked on every line and on the caption |
| **Never an instruction to take** a medicine or a supplement | `copy_rules.prescribes` — naming iron is allowed, telling her to take it is not |
| Every video is about **a different part of her life** | the pillar rotation in `research.js`, one cursor per turn |
| Nothing ever repeats | `content/ledger.json` records every idea, belief and hook, and is fed back into the prompt |

## What the videos are about

Set by the founder on 2026-09-20: the content covers her whole life, not her to-do list.
Seven pillars rotate one per video, so **each day of six videos touches six different
parts of her life** and over two weeks each pillar gets exactly the same number of posts.

| Pillar | What it covers |
| --- | --- |
| `relationships` זוגיות ואנשים | a partner, dating, friends, family. How this shows up between two people rather than inside her head |
| `work` עבודה | a job, a shift, studies, her own business, and the gap between what she can do and the shape of the day around her |
| `health` בריאות וגוף | sleep, movement, the cycle, pain, doctors, appointments never made. Where the research about **women** with ADHD actually lives |
| `food` אוכל | how eating actually happens on a day when nothing else does. **Never a diet, never a body** |
| `womanhood` להיות אישה עם ADHD | the diagnosis fifteen years late, the girl who was quiet and therefore invisible, the cost of appearing fine |
| `mood` רגשות | the feeling itself, which the founder named as her first problem |
| `daily` היום יום | the form, the appointment, the laundry, the nine things open at eighty percent |

Each pillar carries concrete **scenes** to write at the right altitude, and a `neverSay`
list of true things that would damage her. Those lists are not stylistic. The work pillar
knows that advising an Israeli woman to disclose her diagnosis to her employer is advice
with a real cost attached. The food pillar knows that women with ADHD have a markedly
raised rate of binge eating, which is exactly why food content aimed at her must never
become diet content: the women most likely to be harmed by a weight video are the women
watching.

Pick one deliberately with `node scripts/generate_content.js --gemini --pillar food`.

## What the videos may claim

`scripts/lib/research.js` holds 23 findings about women with ADHD, each read out of a
real study and each carrying its source. Before this the writer had feelings and nothing
else, because inventing figures was banned outright and rightly so.

The ban is now narrower and enforced instead of requested:

- Facts are offered as **a shelf, not an assignment**. Most good videos here use none.
- A **number may only be spoken if the library permits it**. The script declares which
  findings it used in `factsUsed`, the validator resolves them against the library, and
  any other figure on a claim line is rejected.
- A finding whose figure was **not verified at the primary source carries no number at
  all** — the claim may be used, the statistic may not. That is why the widely quoted
  "91.6% of adults with ADHD mask" is in the library without its number.
- Anything touching a medicine, a supplement or a test is flagged `medical` and carries
  its own instruction. It may report what researchers found. It may never tell her to
  take anything.
- Scene numbers are **not** statistics. "The form has been open eleven days" is the best
  writing on this account and the checker leaves it alone; it only fires on a line that
  invokes research or a percentage.

Health, food and womanhood are flagged `researchMatters`, so a video there is pushed to
use a finding. That is the one thing this account can give her that a motivational page
cannot.

## Who every video is for

**One woman with ADHD, anywhere from 18 to about 50.** Set by the founder on 2026-09-18,
replacing the 2026-09-12 decision that the content was for everyone, any age, any gender.
The band started at 18 to 25 and she widened it to 50 the same day; do not narrow it back.

She might be a student, at work, a mother of small children, running her own thing, or
several at once. **A video may live in one of those lives. A line may not assume one** —
a line that only makes sense to a student tells every other woman the account is not for
her, and a line that assumes children does the same in the other direction. Be specific
about the moment, not about her circumstances: "the message has been unanswered for nine
days and the reply is one sentence" is true at nineteen and at forty five.

She came for three things, in this order: **moods** that turn over without a reason she
can name, **nothing ever getting finished** while nine things sit open at eighty percent,
and **the ordinary machinery of a day** — the form, the appointment, the bank app, sleep.
These three, not her age, are what makes a video recognisable, and all three are as true
at forty five as at nineteen. That is why the band could widen without the content
underneath it changing at all.

The description lives in exactly one place, `AVATAR` in `scripts/lib/copy_rules.js`, and
the writer's brief interpolates it. Change it there and every video changes with it;
never restate it in a second file, which is how two versions start drifting apart.

Two of the emotional drivers, `regulation` and `sensitivity`, exist because of her: the
other eleven are all about getting things done, and she named moods as her first problem.

**The address is singular feminine and the guard enforces it.** Both dodges are rejected
— masculine (`אתה`, `תתחיל`) and plural (`תגיבו`, `שלכם`), the plural having been turned
down by name for sounding like a phone company. `שלך` and `לך` are correct and stay: they
are spelled the same for both genders. That last fact is also why the script-level check
exists — spelling alone does not survive being read aloud, so a few lines per script must
use a form the narrator can only read one way (`תתחילי`, `מתחילה`, `את`).

Structure of every script: **hook** (one line, built to stop the scroll) →
**12 value lines** (concrete and usable today) → **4 turn lines** → **the call to action**.

The turn lines used to be fear lines — a vivid picture of her life in a year if she does
nothing — and that is now forbidden outright, in the prompt and in this file. Fear is the
shame this account exists to remove, and it was the single worst fit for this reader.
They describe instead: one small believable scene of something that went better. "הטופס
נשלח ביום שלישי" is right; "בעוד שנה שום דבר לא ישתנה" is the old version and is wrong.

That lands at roughly **65 seconds**. The first build used 18 value lines and produced
an 87 second reel — long enough that a real share of viewers leave before the call to
action appears, which defeats the whole point when comments are the goal. Change
`VALUE_CUES` in `generate_content.js` to move it; the validator accepts 10 to 20 so a
hand written script does not have to hit the number exactly.

One of the 13 emotional drivers powers each video, rotating in order: recognition,
regulation, sensitivity, relief, mechanism, reframe, momentum, agency, ease, pride,
belonging, hope, honesty. They live in `scripts/lib/copy_rules.js`, and every one of them
works by removing shame rather than applying it — the original direct response set (fear,
status, money, scarcity, anger) was thrown out on 2026-09-12 because all five levers work
by making the viewer feel behind, which is the one thing this audience has had since
primary school.

## The call to action

Instagram (comments are the goal, and a comment can be answered with a DM):

> תגיבי "אני" אם את עדיין כאן,
> וקבלי 7 ימי ניסיון באפליקציה
> בחינם 👇

TikTok and YouTube have no reliable comment to DM path, so they send people to the profile:

> את רוצה 7 ימי ניסיון
> באפליקציה בחינם?
>
> כנסי לקישור בפרופיל שלנו.

Two words in these cards were **rewritten rather than converted** when the account moved
to the feminine, and the reason applies to any card written later. The direct conversions
were `הגעת` and `רוצה`, which are spelled identically for both genders — the choice only
exists out loud, and an unvocalised script hands it to the TTS, which gets it wrong often
enough that it already happened twice on the promo reel. This card closes every single
video, so a masculine reading of it would be the most repeated mistake on the account.
`את`, `תגיבי`, `וקבלי` and `כנסי` can each be read one way only.

That means two renders per slot: the Instagram cut and a shared TikTok/YouTube cut.

---

## Files

```
scripts/
  main.js              orchestrator — one run schedules a whole day
  generate_content.js  AI writer + validator + never-repeat ledger
  render_video.js      TTS, stock footage, subtitles, music, ffmpeg mux
  music.js             Jamendo, commercial-safe licences only
  upload_host.js       GitHub Release as the public video host
  schedule_buffer.js   Buffer GraphQL
  doctor.js            preflight — run this first, always
  selftest.js          rule checks that need no API keys
  lib/copy_rules.js    the house style: avatar, motivators, CTA, word rules,
                       and the three checks on what may never be said
  lib/research.js      the seven pillars of her life, and every finding the
                       account is allowed to claim, each with its source
content/ledger.json    everything ever published, so it is never repeated,
                       including which pillar and which findings each video used
.github/workflows/daily-videos.yml
```

## Schedule

Six slots, Israel time: **07:45 · 10:30 · 13:15 · 16:00 · 18:45 · 22:00**.
Edit `SLOTS` in `scripts/main.js` to change them.

The workflow fires at 04:00 Israel. If the first slot has already passed when a run
starts, the whole day is booked for tomorrow instead of dropping slots.

---

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in.
3. `node scripts/doctor.js` — it checks every key, the Buffer channels, and that the
   video host repo is public and writable. Do not skip this.
4. `node scripts/selftest.js` — verifies the subtitle rules and the timezone maths.
5. First real run: `FORCE_RUN=true node scripts/main.js`
6. Push to GitHub, add the secrets listed in the workflow, done.

### Keys needed

| Key | Where |
| --- | --- |
| `PIXABAY_KEY` | pixabay.com/api/docs |
| `JAMENDO_CLIENT_ID` | devportal.jamendo.com |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `BUFFER_ACCESS_TOKEN` | publish.buffer.com → Settings → API |
| `BUFFER_CHANNEL_*` | `node -e "..."` or the doctor output |
| `VIDEO_HOST_REPO` + `GITHUB_TOKEN` | a **public** repo you own, token with `contents: write` |

---

## Things that will bite you

**The old Buffer REST API is dead.** `api.bufferapp.com/1/*` returns 401 for every token,
including valid ones. The live API is GraphQL at `https://api.buffer.com` with no path.
Do not trust any tutorial that says otherwise.

**The video host repo must be public.** Buffer downloads the MP4 anonymously. A private
repo's release URL 404s for it and the post fails with no obvious reason. `doctor.js`
checks this.

**Music licensing.** Jamendo's catalogue is mostly NonCommercial, which does not cover
marketing a paid product. `music.js` keeps only CC BY and CC BY-SA tracks and writes every
artist to `assets/music/CREDITS.md`. The credit line also goes into the post caption.
If that ever stops being wanted, buy a stock music subscription and drop the files into
`assets/music/` instead — `music.js` will use what is already cached.

**Buffer queue limits.** On the free plan each channel holds a limited number of queued
posts. Six a day per channel is fine as long as the daily run keeps happening.

**A custom thumbnail IMAGE is rejected.** Buffer's schema says so in as many words:
the networks do not accept one, and setting `assets[].video.thumbnailUrl` fails the
whole post. The only lever is `assets[].video.metadata.thumbnailOffset`, a frame offset
in **milliseconds**, and only Instagram, TikTok and Pinterest honour it. YouTube gets
whatever it picks, which is why the hook caption is also burned onto frame 0.

**Leave the offset out and Instagram chooses for you**, and it habitually chooses a
frame from a silent gap — so the tile that sits on the profile forever shows stock
footage with no words on it. That is what happened to the first batch of reels. Their
covers cannot be repaired after the fact: Instagram will not let a published Reel change
its cover, so those tiles stay wrong unless the post is deleted and put up again.

**Instagram direct publishing** needs the account connected to Buffer as a Business or
Creator account. If posts land as "notification" reminders instead of publishing by
themselves, that is the cause, not the code.

**No Jamendo key yet?** `music.js` synthesises a calm ambient pad locally instead, so
nothing blocks. Add `JAMENDO_CLIENT_ID` and real music takes over on the next run.

---

Started from the skeleton at github.com/Tkui421/instagram-daily-videos-skill, then
substantially rewritten: the content generator, the render engine, the music source,
the video host and the Buffer client are all new.
