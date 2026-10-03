# STI eLMS dashboard

A personal, read-only web dashboard for [elms.sti.edu](https://elms.sti.edu), signed in with
**your own** account. Runs on Next.js and deploys to Vercel in one command.

![stack](https://img.shields.io/badge/Next.js-15-000?logo=next.js) ![runtime](https://img.shields.io/badge/runtime-Node%2020%2B-2f6f4e) ![license](https://img.shields.io/badge/license-MIT-blue)

---

## What this is

STI's eLearning Management System is a [Neo LMS](https://academysoft.com/) deployment running on
**Ruby on Rails**. Verified from the public markup:

| Evidence | Conclusion |
| --- | --- |
| `case-study-neo-lms-and-sti-college.png` | Neo LMS (AcademySoft) |
| `<input name="utf8" value="✓">`, `authenticity_token`, `on_ready()` | Ruby on Rails, not PHP/Canvas |
| `?lmsauth=<hex>` on every attachment URL | Signed file URLs |
| No `/api/` route, no JSON in any page | **Server-rendered HTML only — no public API** |
| `robots.txt` disallows `/log_in/`, `/info/`, `/help/` | Keep your scraper off those routes |

Because there is no API, this app parses HTML. That is the honest core constraint of the whole
project, and the reason the DOM inspector below exists.

## Features

- **Course dashboard** — your enrolled courses on one page.
- **Per-course detail** — assignments, announcements and grade rows as JSON.
- **Route discovery** — reads the real in-app links out of your navigation, so you never have to
  guess URLs.
- **DOM inspector** — renders any authenticated eLMS page as escaped source, so fixing a broken
  selector takes one page reload instead of an afternoon of guessing.
- **Encrypted session storage** — your cookie jar is sealed with AES-256-GCM into your own
  httpOnly cookie. No database, no session table, survives Vercel cold starts.
- **Optional app password** — one shared password in front of the whole app.

## Architecture

```
Browser (once, by hand)
   └── signs in at elms.sti.edu via Microsoft Entra ID
        └── you copy the cookies out of DevTools

Vercel
   ├── GET  /                     dashboard
   ├── POST /api/session          validate + seal your cookie jar
   ├── GET  /api/courses          JSON course list
   ├── GET  /api/courses/:id      assignments, announcements, grades
   ├── GET  /api/raw?path=…       DOM inspector
   └── POST /api/gate             optional app password

Vercel is stateless, so the session lives in your encrypted cookie.
Swap lib/session.ts for Vercel KV if the jar outgrows the ~4 KB cookie budget.
```

## Getting started

```bash
npm install
cp .env.example .env.local     # then set SESSION_SECRET
openssl rand -base64 32        # generate SESSION_SECRET
npm run dev                    # http://localhost:3000
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | AES key for the sealed session cookie |
| `APP_PASSWORD` | recommended for public deploys | Password gate in front of the whole app |
| `STI_DASHBOARD_PATH` | no | Defaults to `/home` (confirmed) |
| `STI_COURSES_PATH` | no | Defaults to `/courses` (**404s today**) |
| `STI_ASSIGNMENTS_PATH` | no | Defaults to `/assignments` (**404s today**) |
| `STI_ANNOUNCEMENTS_PATH` | no | Defaults to `/announcements` (**404s today**) |

## Signing in

There are two methods, and which one you need is decided by STI, not by this app.

### Option A — password form

Enter your Office365 username and password at `/session`.

This posts to `POST /log_in/submit_from_portal` with a CSRF token scraped from `GET /log_in/form`.

**It will probably not work for your account.** STI hides that form behind an "Admin log in" toggle,
because normal students are meant to authenticate through Microsoft Entra ID — an OIDC flow that
requires a real browser and may require MFA. A server cannot complete it.

### Option B — paste cookies (the one that works)

1. Open <https://elms.sti.edu> and sign in normally.
2. Open DevTools → **Application** → **Cookies** → `https://elms.sti.edu`.
3. Copy every cookie (a `document.cookie` string or DevTools' JSON export both work).
4. Paste into `/session` under **Paste cookies**.

The app then checks that those cookies are genuinely authenticated by loading the login-gated
dashboard, and refuses to store anything that is not.

### Credentials format

Published on STI's own [FAQ page](https://elms.sti.edu/page/show/495374):

```
Student  [Lastname.last6ofstudentnumber@campus.edu.ph]  /  Lastname + YYYYMMDD
Parent   [studentId]_parent                            /  LastnameYYYYMMDD
```

Passwords are case-sensitive with an uppercase first letter.

## ⚠️ Unconfirmed routes — read this before trusting the parsers

Only one route is confirmed, because confirming the rest requires an account I do not have:

| Route | Status |
| --- | --- |
| `/` | Public landing page. **Never requires a session**, so it cannot be used to test auth. |
| `/home` | **Confirmed** signed-in dashboard. Anonymous visitors are redirected to `/site/not_logged_in?from=%2Fhome&log_in_required=true`. |
| `/courses` | **404.** Verified to not exist. |
| `/my`, `/dashboard`, `/main`, `/calendar`, `/announcements`, `/assignments`, `/profile`, `/user/profile` | **404.** Verified to not exist. |

So: **`/home` and auth detection work today. Course parsing does not, until you tell it the right
route.** That is why the app ships a route-discovery step rather than pretending otherwise.

### How to wire up the rest

1. Sign in via Option B.
2. Open the dashboard. It lists the real routes found in your session.
3. Confirm one with the DOM inspector, e.g. `/api/raw?path=/site/index`.
4. If the course list lives somewhere else, set `STI_COURSES_PATH` and redeploy.
5. Adjust the selectors in `lib/parse.ts` to match the markup you actually got back.

Session cookies expire on the STI side long before this app's 8-hour cookie does. The dashboard
surfaces a "reconnect" link rather than showing a blank page.

## Deploying to Vercel

```bash
npx vercel
```

Or import the repo at [vercel.com/new](https://vercel.com/new) and add both environment variables:

- `SESSION_SECRET` — required, the app refuses to start without it
- `APP_PASSWORD` — set this if the deployment is reachable by anyone else

Nothing else is needed: no database, no build config, Node 20+ runtime is the default.

## Security notes

- **Set `APP_PASSWORD` on any public deployment.** Without it, anyone who finds your URL gets a
  working proxy into their own eLMS account, which is exactly the kind of thing STI would rather
  not see from a student IP.
- **Your STI session is the crown jewel.** It is stored encrypted and httpOnly, but treat the
  deployment as holding a live school session. Rotate it by signing out at elms.sti.edu.
- **Credentials are never persisted.** Password mode submits them straight to STI and discards
  them. Do not add a "remember me" that writes to disk.
- **Login attempts are rate limited** to 10 per IP per 10 minutes, so this app cannot be used to
  hammer STI's login.
- **`/api/raw` cannot be used as an open proxy.** `assertSafePath` rejects `//evil.example` and
  `/\evil.example`, both of which are protocol-relative and would otherwise escape the STI origin.

## Scope

This reads **your own** account: your courses, assignments, announcements and grades.

It deliberately does not submit work, touch attendance, or reach other students' records. Those
are academic-integrity territory, not tooling territory.

If you need more than this, ask first — `elms@sti.edu` or <https://www.sti.edu/support.asp>. Some
Neo LMS installs ship an institution-gated REST API or an official mobile app, which would make
all of this unnecessary.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the build
npm run typecheck  # tsc --noEmit
```

## License

MIT. Not affiliated with or endorsed by STI College.