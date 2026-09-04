# High Lane — website

The marketing site for High Lane. Plain HTML, CSS and JavaScript. No framework,
no dependencies, no server runtime, no database.

## Deploying

The site is a Cloudflare **Worker with static assets** — `high-lane-website`,
built from this repo by Workers Builds. Not a Pages project, despite being
plain static files.

| Setting | Value |
| --- | --- |
| Build command | `node build.js` |
| Assets directory | `dist` (declared in `wrangler.jsonc`) |
| Root directory | `/` |
| Environment variables | none |

`wrangler.jsonc` at the repo root is what points the Worker at `dist/`. Keep
`name` matching the existing Worker — a different name deploys a second one
alongside it.

**`dist/` is git-ignored, so the build command is not optional.** With no build
step there is no `dist/`, and Cloudflare will fall back to whatever other
directory in the repo happens to hold an `index.html` — which is `admin/`, and
which silently serves the CMS at the site's root. That has happened once
already.

Nothing in `dist/` needs a server — it is static files only. The one piece of
server-side code in this repo is `oauth-worker/`, a separate Worker.

## Editing the site without touching code

Content lives at **`/admin`**, a [Decap CMS](https://decapcms.org) install.
Saving there commits JSON to `content/` on `main`, Cloudflare Pages rebuilds,
and the change is live in a minute or two.

Editing rights are GitHub repo write access — nothing else to manage. See
[`oauth-worker/README.md`](oauth-worker/README.md) for the one-time setup and
for how to add or remove an editor.

### What's editable

| Section | Editable | Fixed |
| --- | --- | --- |
| Browser tab / search result | title, description | — |
| Nav & footer | link labels, link targets, button label, the Login tooltip | the logo |
| Hero | badge, wordmark, the 3 rotating services, intro, both buttons | the animated graphic's layout and icons |
| Hero graphic | centre label, 3 node labels, 2 chip labels | icons, wiring, animation |
| Services | heading, subtitle, intro, and per service: number, title, keywords, copy, bullets, button, **photo** | the split-lane graphic |
| Our story | heading, subtitle, paragraphs, both buttons, **the photo** | — |
| Team | heading, subtitle, intro, and per person: name, role, **headshot** | — |
| Testimonials | heading, subtitle, and per review: quote, detail, name, company | — |
| Contact | heading, paragraph, the cards, phone numbers, email, booking link, and whether the booking card shows at all | the icons |
| Footer | links, copyright, ABN | the logo |

### Quirks worth knowing

- **Three is not negotiable in three places.** The hero's rotating services are
  faces of a three-sided prism, the hero graphic has three wired nodes, and the
  three service rows each own a hand-built animation. Adding a fourth of any of
  them either fails the build (the pinwheel) or renders without its graphic.
  Renaming and rewording is completely safe.
- **The hero's longest service name sets the heading's width.** Something much
  longer than "Web Development" will wrap the hero headline on narrow screens.
- **Headshots and the story photo are cropped to 4:5 portrait.** A landscape
  photo loses its top and bottom. Crop before uploading.
- **A team member with no headshot** shows a grey panel with a picture icon.
  That is deliberate, not a broken image.
- **Testimonials are rendered twice** so the marquee can loop seamlessly. You
  enter each one once; the build duplicates it. Editing the same quote twice
  used to be a real trap here — it isn't any more.
- **Nav and footer links must point at a section on this page** (`#services`,
  `#story`, `#team`, `#reviews`, `#contact`). It is a one-page site; a link to
  anything else silently goes nowhere.
- **Phone numbers are two fields**: what's printed, and what gets dialled.
  Change both, or the card shows one number and rings another.
- **`*asterisks*` colour a phrase** in the story heading. That's the only
  formatting available; everything else is escaped, so a stray `<` is harmless.
- **The CMS wins over Claude Design.** Both hold the same copy, but `content/`
  is what gets built. Retype a heading in Claude Design and it will look right
  in the editor and change nothing on the live site. Use Claude Design for
  layout and design; use `/admin` for words and photos.
- **Uploads are capped at 2 MB** and land in `assets/uploads/`. Straight from a
  phone, a photo is often 4-5 MB, and every visitor would download it.
- **Clearing a field hides it.** An empty value removes the element rather than
  leaving an empty box behind, because an empty `<span>` still eats a gap and
  an empty `<p>` still takes a margin. That is how the ABN, the contact-card
  notes and the Login tooltip are switched off. Clear a heading and the heading
  disappears, so only empty what you mean to hide.
- **The Login button and the booking card have on/off switches**, since an
  empty label would only blank the text and leave an empty pill or card
  behind. Both keep their wording while switched off, ready to come back. With it off, the two remaining cards
  share the width; with it on, the email card gets the roomiest column so the
  address stays on one line.
- **House style: no em dashes.** Use a full stop, a colon, or `*asterisks*` to
  make a phrase stand out. The site had them in the hero, the story and the
  contact panel; they are gone.
- **Testimonials are two fields**, a bold pull quote and a smaller detail
  paragraph. A one-line testimonial can leave the detail empty.
- **Each service card has a photograph** filling the right half when it
  opens, bleeding to the card edge. It is cropped to whatever height the text
  beside it happens to be, centred, so any shape works but the middle of the
  picture is what survives. Clear the field and that card is text only, full
  width, with no gap left behind.
- **Service keywords are badges**, one per entry in the list. They used to be
  one run of text with dots between, which wrapped mid-list and left a dot
  stranded at the start of a line. Two or three words each reads best.
- **The team grid is four across**, and a short last row centres under it
  rather than stretching. Three across on a tablet, two on a phone.
- **On a phone the services are a swipeable carousel**, not an accordion:
  every card is already open and you move sideways between them, so the
  arrow points right instead of being a plus. The script skips its toggle
  wiring below 768px, and the stylesheet overrides the inline height it uses
  for the desktop open/close animation. Change one of those and you have to
  change the other.

## The files that matter

- **`content/*.json`** — all the copy. What the CMS writes; what the build reads.
- **`High Lane Media.dc.html`** — the template: structure, styles, animations
  and page logic. A [Claude Design](https://claude.ai) export, so it keeps that
  editor's scaffolding (`<x-dc>`, `<helmet>`, and a `<script type="text/x-dc">`
  logic class). Keep those intact or it stops reopening in Claude Design.
- **`build.js`** — strips the scaffolding, pours in the content, writes `dist/`.
- **`admin/`** — Decap CMS: `index.html` and the field definitions in
  `config.yml`.
- **`oauth-worker/`** — the Cloudflare Worker that signs editors in. Deployed
  separately from the site; not part of `dist/`.
- **`wrangler.jsonc`** — tells Cloudflare the site is `dist/`.

Every style, animation and graphic lives inside the template. There is no
separate CSS or JS file.

## Search and sharing

Generated into `dist/` by the build, from the same content the page uses:

| | |
| --- | --- |
| `<link rel="canonical">` | points at `meta.siteUrl`, so the `workers.dev` copy of the site can't compete with the real domain |
| Open Graph + Twitter tags | title, description and `og-card.jpg` for link previews |
| JSON-LD | `Organization` (name, logo, email, phone, the three services) and `WebSite` |
| `robots.txt` | allows everything except `/admin/`, repeats Cloudflare's AI-crawler blocks, points at the sitemap |
| `sitemap.xml` | one URL; `lastmod` is the newest of the template and `content/`, so a rebuild that changed nothing doesn't claim otherwise |

`Organization` is used rather than `LocalBusiness` on purpose: the latter
wants a street address and Google reports it as an error without one.

Add the LinkedIn and Instagram links under **Site copy → Browser tab and
search results → Social profiles** and they become `sameAs`, which is how
search engines tie the site to those accounts.

## How content reaches the page

The template carries the same copy inline as `content/` does, so it still
previews correctly in Claude Design — but the JSON always wins at build time.
Three hooks connect them:

| Hook | Does |
| --- | --- |
| `data-cms="story.heading"` | replaces that element's contents |
| `data-cms-attr="src=story.image;alt=story.imageAlt"` | sets attributes |
| `<!--cms:team-cards--> … <!--/cms:team-cards-->` | regenerates a run of elements |

The third is for anything repeating — team cards, testimonials, nav links,
bullet lists. Each named region has a generator in `build.js`; a region with no
generator fails the build rather than silently emitting the placeholder markup.

## Building locally

```bash
node build.js          # writes dist/
npx serve dist         # preview the real output
```

`build.js` uses only Node's standard library, so there is no `npm install`
step. It asserts on every transformation; if the template or the content
changes shape, the build fails naming what it could no longer find, rather than
quietly shipping a broken page. It also checks that every image referenced by
the page actually exists in `dist/`.

`/admin` will load from `npx serve dist`, but logging in won't work there —
GitHub's callback points at the deployed Worker. To edit content locally
instead, add `local_backend: true` to `admin/config.yml` and run
`npx decap-server` alongside; that writes to your working copy rather than to
GitHub. Don't commit that line.

## What the build removes

The template carries editor machinery that must not reach production:

| Removed                          | Why                                              |
| -------------------------------- | ------------------------------------------------ |
| `support.js` (69 KB)             | Claude Design runtime; also re-fetches the whole page on load |
| `image-slot.js` (65 KB)          | drag-and-drop image editor, unused at runtime     |
| two `_ds/…` tags                 | a design system not present in this repo — 404s on every load |
| `unpkg.com/lucide@latest`        | unpinned third-party script; the 6 icons used are inlined instead |
| `<x-dc>` / `<helmet>` wrappers   | editor scaffolding                                |

It also lifts the `<helmet>` block into `<head>` (Claude Design leaves it in
`<body>`, which would flash unstyled content on a cold load).

## Assets

- `assets/uploads/` — CMS-managed. Team headshots and the story photo. Safe to
  add to from `/admin`.
- `assets/hlm-logo.png` — the wordmark. `assets/hlm-mark.png` — the swoosh on
  its own. Brand marks, not CMS-managed.
- `assets/favicon.ico`, `icon-32/192/512.png`, `apple-touch-icon.png` — the
  tab and home-screen icon: the swoosh knocked out white on brand teal.
- `assets/og-card.jpg` — the 1200x630 image shown when the site is shared.

The last two groups are **generated**. Re-run `python3 tools/make-icons.py`
after changing the logo or the mark; it needs Pillow and is not part of the
build.
- `assets/hlm-logo-original.png` — the untrimmed master, kept for re-cropping.
  Excluded from `dist/`.

## archive/

Not built, not served, not copied into `dist/` — kept so it can come back.

- **`service-mocks.html`** — the animated vignettes that used to fill the
  right half of each expanded service row: posts cycling with a sparkline,
  inputs routed through an AI node, a browser skeleton. Markup and stylesheet
  together, with instructions at the top for putting one back. `hl-float` is
  deliberately not in there, because the hero graphic still uses it.
- **`service-images-source/`** — the full-size originals of the three service
  photographs, before they were resized and re-encoded into `assets/uploads/`.

## Not in this repo

`inspiration/` (reference screenshots) is git-ignored. It stays on disk locally
and is never published.

## Still to come

- **Headshots for Lishan De Silva and Nivirithi Sirisha Dookhun.** Both show
  the grey "Headshot" placeholder until someone uploads one at `/admin`.
- **The ABN** is hidden, not removed. Type it into the footer field to show it.
- **The booking card** is switched off while there is no calendar to point at.
  Turn on "Show this card" under Contact, and fix the link, to bring it back.
- **The Login button** is switched off. Turn on "Show this button" under
  Navigation when there is somewhere for clients to log in to. Its label,
  link and tooltip are all still there.

All of these are editable at `/admin`, with no code change needed.
