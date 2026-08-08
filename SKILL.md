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
| Gender neutral, third grade Hebrew, no dashes | prompt rules plus a validator that rejects `אתה` / `את` / `שלך` and dash characters |
| Nothing ever repeats | `content/ledger.json` records every idea, belief and hook, and is fed back into the prompt |

Structure of every script: **hook** (one line, built to stop the scroll) →
**12 value lines** (concrete and usable today) → **4 fear lines** (a vivid picture of
their life in a year if they do nothing) → **the call to action**.

That lands at roughly **65 seconds**. The first build used 18 value lines and produced
an 87 second reel — long enough that a real share of viewers leave before the call to
action appears, which defeats the whole point when comments are the goal. Change
`VALUE_CUES` in `generate_content.js` to move it; the validator accepts 10 to 20 so a
hand written script does not have to hit the number exactly.

One of the 11 survival motivators drives each video, rotating in order:
fear, status, money, ease, saving, opportunity, security, control, anger, freedom, belonging.
They live in `scripts/lib/copy_rules.js`.

## The call to action

Instagram (comments are the goal, and a comment can be answered with a DM):

> תגיבו "אני" אם הגעתם עד לכאן
> וקבלו 7 ימי ניסיון בחינם באפליקציה 👇

TikTok and YouTube have no reliable comment to DM path, so they send people to the profile:

> רוצים את 7 ימי הניסיון?
> הקישור בפרופיל, לחצו והורידו עכשיו 👇

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
  lib/copy_rules.js    the house style: motivators, CTA, word rules
content/ledger.json    everything ever published, so it is never repeated
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

**Instagram direct publishing** needs the account connected to Buffer as a Business or
Creator account. If posts land as "notification" reminders instead of publishing by
themselves, that is the cause, not the code.

**No Jamendo key yet?** `music.js` synthesises a calm ambient pad locally instead, so
nothing blocks. Add `JAMENDO_CLIENT_ID` and real music takes over on the next run.

---

Started from the skeleton at github.com/Tkui421/instagram-daily-videos-skill, then
substantially rewritten: the content generator, the render engine, the music source,
the video host and the Buffer client are all new.
