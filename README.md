# High Lane — website

The marketing site for High Lane. Plain HTML, CSS and JavaScript. No framework,
no dependencies, no server runtime.

## Deploying (Cloudflare Pages)

| Setting               | Value           |
| --------------------- | --------------- |
| Build command         | `node build.js` |
| Build output directory| `dist`          |
| Root directory        | *(leave blank)* |
| Environment variables | none            |

Nothing in `dist/` needs a server — it is static files only.

## The two files that matter

- **`High Lane Media.dc.html`** — the source page, and the one to edit. It is a
  [Claude Design](https://claude.ai) export, so it keeps that editor's
  scaffolding: an `<x-dc>` wrapper, a `<helmet>` block, and the page logic in a
  `<script type="text/x-dc">` class. Keep those intact or the file stops
  reopening in Claude Design.
- **`build.js`** — strips that scaffolding and writes `dist/index.html`.

Everything else — every style, animation and graphic — lives inside the source
page. There is no separate CSS or JS file.

## Building locally

```bash
node build.js          # writes dist/
npx serve dist         # preview the real output
```

`build.js` uses only Node's standard library, so there is no `npm install` step.
It asserts on every transformation it makes; if the source changes shape, the
build fails with a message naming what it could no longer find, rather than
quietly shipping a broken page.

## What the build removes

The source page carries editor machinery that must not reach production:

| Removed                          | Why                                              |
| -------------------------------- | ------------------------------------------------ |
| `support.js` (69 KB)             | Claude Design runtime; also re-fetches the whole page on load |
| `image-slot.js` (65 KB)          | drag-and-drop image editor, unused at runtime     |
| two `_ds/…` tags                 | a design system not present in this repo — 404s on every load |
| `unpkg.com/lucide@latest`        | unpinned third-party script; the 6 icons used are inlined instead |
| `<x-dc>` / `<helmet>` wrappers   | editor scaffolding                                |

It also lifts the `<helmet>` block into `<head>` (Claude Design leaves it in
`<body>`, which would flash unstyled content on a cold load).

## Editing copy

Open `High Lane Media.dc.html` in Claude Design, or edit the text directly —
each section starts with a comment banner listing exactly which copy it holds.
Then re-run `node build.js`.

## Not in this repo

`inspiration/` (reference screenshots) is git-ignored. It stays on disk locally
and is never published.

## Still placeholder

- Testimonials in the Reviews section are invented — replace before launch.
- Team roles all read "Role TBC"; the fifth member has no photo or name.
- `hello@highlanemedia.com` and the `cal.com/highlanemedia/intro` booking link.
- Phone numbers `0161 496 0142` and `07700 900 482`.
