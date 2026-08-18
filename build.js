#!/usr/bin/env node
/**
 * High Lane — static site build.
 *
 * Turns the Claude Design source file (`High Lane Media.dc.html`) plus the
 * JSON in `content/` into a plain static page at `dist/index.html`, with no
 * runtime dependencies of any kind.
 *
 *   node build.js        →  dist/
 *
 * There is no bundler, no npm install and no server runtime. This script only
 * uses `node:fs` and `node:path`.
 *
 * ── content ────────────────────────────────────────────────────────────────
 * Every piece of editable copy lives in `content/*.json`, which is what Decap
 * CMS writes to. The template carries the same copy inline so the file still
 * previews correctly in Claude Design — but at build time the JSON always
 * wins. Three hooks connect them:
 *
 *   data-cms="path"                      replace this element's contents
 *   data-cms-attr="href=path;alt=path"   set attributes on this element
 *   <!--cms:name--> … <!--/cms:name-->   regenerate a run of elements
 *
 * ── stripped ───────────────────────────────────────────────────────────────
 *   · <x-dc> / <helmet> wrappers      — Claude Design editor scaffolding
 *   · support.js       (69 KB)        — the Claude Design runtime
 *   · image-slot.js    (65 KB)        — drag-and-drop image editor
 *   · the two _ds/… tags              — a design system that isn't in this repo
 *                                       and 404s on every page load
 *   · unpkg.com/lucide@latest         — an UNPINNED third-party script; the six
 *                                       icons actually used are inlined instead
 *
 * …and it rewrites the <script type="text/x-dc"> logic class into an ordinary
 * IIFE, so the page runs on its own.
 *
 * Every replacement below asserts that it matched. If someone edits the source
 * in Claude Design and the shape changes, this build fails loudly rather than
 * silently shipping a broken page.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'High Lane Media.dc.html');
const CONTENT_DIR = path.join(ROOT, 'content');
const ADMIN = path.join(ROOT, 'admin');
const OUT = path.join(ROOT, 'dist');

/* Lucide icons used by the page, extracted from the rendered output.
   Lucide is ISC licensed. Keys match the `data-lucide` attribute values. */
const ICONS = {
  'megaphone': '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  'cpu': '<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/><path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  'layout-panel-left': '<rect width="7" height="18" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>',
  'phone-call': '<path d="M13 2a9 9 0 0 1 9 9"/><path d="M13 6a5 5 0 0 1 5 5"/><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  'mail': '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  'calendar-check': '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="m9 15 2 2 4-4"/>'
};

const steps = [];
function cut(src, needle, replacement, label) {
  if (!src.includes(needle)) {
    throw new Error(`build failed: could not find ${label}.\nThe source file has changed shape — update build.js.`);
  }
  steps.push(label);
  return src.split(needle).join(replacement);
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTENT — everything Decap CMS writes
   ══════════════════════════════════════════════════════════════════════════ */

function readJSON(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'));
  } catch (err) {
    throw new Error(`build failed: could not read content/${name} — ${err.message}`);
  }
}

const content = Object.assign({}, readJSON('site.json'), {
  team: readJSON('team.json'),
  reviews: readJSON('testimonials.json')
});

function get(key) {
  const value = key.split('.').reduce((o, k) => (o == null ? o : o[k]), content);
  if (value === undefined || value === null) {
    throw new Error(`build failed: "${key}" is missing from content/*.json.`);
  }
  return value;
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (v) => esc(v).replace(/"/g, '&quot;');

/* Editors get exactly one piece of inline markup: *emphasis* becomes <em>.
   Everything else is escaped, so a stray < typed into the CMS can't break
   the page. */
const rich = (v) => esc(v).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

/* Decap writes "/assets/uploads/x.jpg" — its public_folder. The rest of the
   page uses document-relative paths, which also survive being served from a
   subdirectory, so normalise onto that. */
const url = (v) => String(v).replace(/^\/+(assets\/)/, '$1');

/* ── generated runs ─────────────────────────────────────────────────────── */

const REGIONS = {
  'nav-links': () => get('nav.links')
    .map((l) => `<a class="nav-link" href="${escAttr(l.href)}">${esc(l.label)}</a>`).join(''),

  'footer-links': () => get('footer.links')
    .map((l) => `<a href="${escAttr(l.href)}">${esc(l.label)}</a>`).join(''),

  /* The wheel is a three-sided prism: three faces 120° apart, plus a hidden
     sizer holding the longest name so the box can't resize mid-turn. Any
     other count needs new geometry in the stylesheet. */
  'hero-pinwheel': () => {
    const names = get('hero.services');
    if (!Array.isArray(names) || names.length !== 3) {
      throw new Error('build failed: hero.services must hold exactly three names — the ' +
        'pinwheel is a three-sided prism and its CSS is cut for three faces.');
    }
    const longest = names.reduce((a, b) => (String(b).length > String(a).length ? b : a));
    return `<span class="pw-sizer">${esc(longest)}.</span>` +
      '<span class="pw-prism" id="hl-wheel">' +
      names.map((n, i) => `<span class="pw-face f${i + 1}">${esc(n)}<i>.</i></span>`).join('') +
      '</span>';
  },

  'story-paragraphs': () => get('story.paragraphs')
    .map((t, i) => `<p class="lede" style="margin-top:${i === 0 ? 20 : 18}px">${rich(t)}</p>`).join(''),

  'team-cards': () => get('team.members').map((m) => {
    const shot = m.image
      ? `<img src="${escAttr(url(m.image))}" alt="${escAttr(m.name)}">`
      : '<div class="portrait-empty" role="img" aria-label="Headshot to come">Headshot</div>';
    return '<div class="person">' +
      `<div class="portrait">${shot}</div>` +
      `<div class="who"><p class="nm">${esc(m.name)}</p><p class="rl">${esc(m.role)}</p></div>` +
      '</div>';
  }).join(''),

  /* The marquee scrolls by exactly -50%, so the tape holds the same cards
     twice. The second pass is aria-hidden, so a screen reader hears each
     testimonial once. */
  'review-cards': () => {
    const items = get('reviews.items');
    if (!items.length) {
      throw new Error('build failed: content/testimonials.json has no items — the review marquee needs at least one.');
    }
    const card = (r, dup) =>
      `<figure class="review"${dup ? ' aria-hidden="true"' : ''}>` +
      `<span class="qm"${dup ? '' : ' aria-hidden="true"'}>“</span>` +
      `<blockquote>${esc(r.quote)}</blockquote>` +
      `<p>${esc(r.detail)}</p>` +
      `<figcaption><strong>${esc(r.name)}</strong>${esc(r.company)}</figcaption>` +
      '</figure>';
    return items.map((r) => card(r, false)).join('') + items.map((r) => card(r, true)).join('');
  },

  'contact-phones': () => get('contact.phone.numbers')
    .map((n) => `<a class="tel" href="tel:${escAttr(n.tel)}">${esc(n.display)}</a>`).join(''),

  /* <wbr> after the @, so a narrow card breaks the address there rather than
     through the middle of the domain. */
  'contact-email': () => {
    const address = String(get('contact.email.address'));
    const at = address.lastIndexOf('@');
    const shown = at < 0 ? esc(address)
      : `${esc(address.slice(0, at + 1))}<wbr>${esc(address.slice(at + 1))}`;
    return `<a class="tel eml" href="mailto:${escAttr(address)}">${shown}</a>`;
  },

  'svc-bullets': (i) => get(`services.items.${i}.bullets`)
    .map((b) => `<li>${esc(b)}</li>`).join('')
};

/* ── the three template hooks ───────────────────────────────────────────── */

/* Find the element carrying the attribute at `idx`, and where its matching
   close tag starts. Counts nested tags of the same name, so a hook on an
   outer <div> doesn't stop at an inner one's </div>. */
function elementSpan(html, idx) {
  const open = html.lastIndexOf('<', idx);
  const name = (/^<([a-zA-Z][\w-]*)/.exec(html.slice(open, open + 40)) || [])[1];
  if (!name) throw new Error('build failed: a data-cms attribute is not inside a tag.');
  const openEnd = html.indexOf('>', idx) + 1;
  const re = new RegExp(`<(/?)${name}\\b`, 'gi');
  re.lastIndex = openEnd;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { open, openEnd, closeStart: m.index };
  }
  throw new Error(`build failed: no closing </${name}> for a data-cms element.`);
}

function injectContent(html) {
  let regions = 0, texts = 0, attrs = 0;

  for (const [name, produce] of Object.entries(REGIONS)) {
    const re = new RegExp(`<!--cms:${name}(?::([^-]*))?-->`);
    let m;
    while ((m = re.exec(html))) {
      const close = `<!--/cms:${name}${m[1] !== undefined ? ':' + m[1] : ''}-->`;
      const end = html.indexOf(close, m.index);
      if (end < 0) throw new Error(`build failed: missing ${close} in the template.`);
      html = html.slice(0, m.index) + produce(m[1]) + html.slice(end + close.length);
      regions++;
    }
  }
  const stray = /<!--\/?cms:([\w-]+)/.exec(html);
  if (stray) {
    throw new Error(`build failed: the template has a <!--cms:${stray[1]}--> region with no generator in build.js.`);
  }

  /* attributes first — the text pass rewrites the same open tag */
  for (;;) {
    const m = /\sdata-cms-attr="([^"]*)"/.exec(html);
    if (!m) break;
    const openStart = html.lastIndexOf('<', m.index);
    const openEnd = html.indexOf('>', m.index) + 1;
    let tag = html.slice(openStart, openEnd).replace(m[0], '');
    for (const pair of m[1].split(';')) {
      const [attr, key] = pair.split('=');
      const value = ` ${attr}="${escAttr(url(get(key)))}"`;
      const existing = new RegExp(`\\s${attr}="[^"]*"`);
      tag = existing.test(tag) ? tag.replace(existing, value) : tag.slice(0, -1) + value + '>';
      attrs++;
    }
    html = html.slice(0, openStart) + tag + html.slice(openEnd);
  }

  for (;;) {
    const m = /\sdata-cms="([^"]*)"/.exec(html);
    if (!m) break;
    const span = elementSpan(html, m.index + 1);
    const tag = html.slice(span.open, span.openEnd).replace(m[0], '');
    html = html.slice(0, span.open) + tag + rich(get(m[1])) + html.slice(span.closeStart);
    texts++;
  }

  steps.push(`content injected: ${texts} text hooks, ${attrs} attributes, ${regions} generated regions`);
  return html;
}

/* ══════════════════════════════════════════════════════════════════════════
   BUILD
   ══════════════════════════════════════════════════════════════════════════ */

let html = fs.readFileSync(SRC, 'utf8');

/* ── 0. pour the JSON into the template ─────────────────────────────────── */
html = injectContent(html);

/* ── 1. strip the editor runtime and the dead design-system links ───────── */
html = cut(html, '<script src="./support.js"></script>\n', '', 'support.js tag');
html = cut(html,
  '<link rel="stylesheet" href="_ds/modernist-28d11f88-3de9-49ec-bc66-7b499bb184e1/styles.css">\n',
  '', '_ds stylesheet link');
html = cut(html,
  '<script src="_ds/modernist-28d11f88-3de9-49ec-bc66-7b499bb184e1/_ds_bundle.js"></script>\n',
  '', '_ds bundle tag');
html = cut(html, '<script src="image-slot.js"></script>\n', '', 'image-slot.js tag');
html = cut(html,
  '<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>\n',
  '', 'unpinned lucide CDN tag');

/* ── 2. unwrap the scaffolding, and lift <helmet> into <head> ───────────────
   Claude Design keeps <helmet> inside <body>. Leaving the stylesheet there
   would let the browser paint before it parses, so the page would flash
   unstyled on a cold load — move the whole block into <head>. */
const helmet = html.match(/<helmet>\n([\s\S]*?)\n<\/helmet>\n/);
if (!helmet) throw new Error('build failed: could not find the <helmet> block.');
html = html.replace(helmet[0], '');
html = cut(html, '</head>\n', helmet[1] + '\n</head>\n', 'head close');
steps.push('helmet lifted into <head>');

html = cut(html, '<x-dc>\n', '', 'x-dc open');
html = cut(html, '</x-dc>\n', '', 'x-dc close');

/* ── 3. inline the icons ────────────────────────────────────────────────── */
let iconCount = 0;
html = html.replace(/<i data-lucide="([a-z-]+)"><\/i>/g, (m, name) => {
  const body = ICONS[name];
  if (!body) throw new Error(`build failed: no inlined SVG for lucide icon "${name}". Add it to ICONS in build.js.`);
  iconCount++;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
         `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
});
if (iconCount === 0) throw new Error('build failed: no data-lucide icons matched.');
steps.push(`${iconCount} icons inlined`);

/* ── 4. rewrite the dc logic class as an ordinary script ────────────────── */
const openTag = html.match(/<script type="text\/x-dc"[^>]*data-props="([^"]*)"[^>]*>/);
if (!openTag) throw new Error('build failed: could not find the <script type="text/x-dc"> tag.');

// carry the authored default through, so the two files can't drift
const props = JSON.parse(openTag[1].replace(/&quot;/g, '"'));
const wheelSeconds = props.wheelSeconds.default;
if (typeof wheelSeconds !== 'number') throw new Error('build failed: wheelSeconds default is not a number.');

const bodyStart = html.indexOf(openTag[0]) + openTag[0].length;
const bodyEnd = html.indexOf('</script>', bodyStart);
if (bodyEnd < 0) throw new Error('build failed: unterminated dc script.');
let logic = html.slice(bodyStart, bodyEnd);

logic = cut(logic, 'class Component extends DCLogic {',
  `class HighLane {\n  constructor() { this.props = { wheelSeconds: ${wheelSeconds} }; }`,
  'logic class declaration');

// icons are static now, so the lucide wiring is dead code
logic = cut(logic, '    this.wireLucide();\n', '', 'wireLucide() call');
const wlStart = logic.indexOf('  wireLucide() {');
const wlEnd = logic.indexOf('\n  }\n', logic.indexOf('go();', wlStart)) + 5;
if (wlStart < 0 || wlEnd < 5) throw new Error('build failed: could not remove wireLucide().');
logic = logic.slice(0, wlStart) + logic.slice(wlEnd);
steps.push('wireLucide() removed');

const plain = `<script>\n(() => {\n"use strict";\n${logic}\nconst app = new HighLane();\nconst start = () => app.componentDidMount();\nif (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);\nelse start();\n})();\n</script>`;

html = html.slice(0, html.indexOf(openTag[0])) + plain + html.slice(bodyEnd + '</script>'.length);
steps.push('logic class rewritten as plain JS');

/* ── 5. sanity checks on the finished document ─────────────────────────── */
for (const banned of ['x-dc', 'support.js', 'image-slot', 'unpkg.com', '_ds/', 'DCLogic', 'data-dc-script', 'data-cms']) {
  if (html.includes(banned)) throw new Error(`build failed: "${banned}" still present in output.`);
}
if (!html.includes('<!DOCTYPE html>') || !html.includes('</html>')) {
  throw new Error('build failed: output is not a complete document.');
}

/* ── 6. write dist/ ─────────────────────────────────────────────────────── */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), {
  recursive: true,
  // hlm-logo-original.png is the untrimmed master, kept for re-cropping only
  filter: (s) => {
    const b = path.basename(s);
    return b !== '.DS_Store' && !b.includes('-original.');
  }
});

/* Decap CMS ships with the site: /admin is a static page that talks to GitHub
   straight from the browser. config.yml has to sit next to it. */
fs.cpSync(ADMIN, path.join(OUT, 'admin'), { recursive: true });
steps.push('admin/ copied to dist/admin');

/* Every image the page asks for must exist, or the CMS has been pointed at a
   file that never got committed. */
const missing = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((src) => !/^https?:/.test(src) && !fs.existsSync(path.join(OUT, src)));
if (missing.length) {
  throw new Error(`build failed: referenced but not in dist/:\n  ${missing.join('\n  ')}`);
}
steps.push('every <img> resolves inside dist/');

const bytes = (p) => fs.statSync(p).size;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(OUT);
const total = files.reduce((n, f) => n + bytes(f), 0);

console.log('High Lane — static build');
for (const s of steps) console.log('  ·', s);
console.log(`\n  content:  ${get('services.items').length} services, ` +
  `${get('team.members').length} team, ${get('reviews.items').length} testimonials`);
console.log(`  dist/index.html   ${(bytes(path.join(OUT, 'index.html')) / 1024).toFixed(1)} KB`);
console.log(`  ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB total`);
console.log('\n  output directory: dist');
