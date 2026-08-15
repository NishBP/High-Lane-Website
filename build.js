#!/usr/bin/env node
/**
 * High Lane — static site build.
 *
 * Turns the Claude Design source file (`High Lane Media.dc.html`) into a plain
 * static page at `dist/index.html`, with no runtime dependencies of any kind.
 *
 *   node build.js        →  dist/
 *
 * There is no bundler, no npm install and no server runtime. This script only
 * uses `node:fs` and `node:path`. What it strips out of the source:
 *
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
const OUT = path.join(ROOT, 'dist');

/* Lucide icons used by the page, extracted from the rendered output.
   Lucide is ISC licensed. Keys match the `data-lucide` attribute values. */
const ICONS = {
  'megaphone': '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  'cpu': '<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/><path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  'layout-panel-left': '<rect width="7" height="18" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>',
  'phone-call': '<path d="M13 2a9 9 0 0 1 9 9"/><path d="M13 6a5 5 0 0 1 5 5"/><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  'message-square': '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
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

let html = fs.readFileSync(SRC, 'utf8');

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

/* ── 4. the one <image-slot> is an editor-only placeholder ──────────────── */
html = cut(html,
  '<image-slot id="hl-team-5" shape="rect" placeholder="Headshot"></image-slot>',
  '<div class="portrait-empty" role="img" aria-label="Headshot to come">Headshot</div>',
  '<image-slot> placeholder');
html = cut(html, '.portrait img,.portrait image-slot{', '.portrait img{',
  '<image-slot> style rule');

/* ── 5. rewrite the dc logic class as an ordinary script ────────────────── */
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

/* ── 6. a placeholder style for the empty team slot ─────────────────────── */
html = cut(html, '/* ── REVIEWS',
  `.portrait-empty{display:flex;align-items:center;justify-content:center;height:100%;
  background:var(--surface-2);color:var(--ink-40);font-size:12px;letter-spacing:.08em;
  text-transform:uppercase;font-weight:600}

/* ── REVIEWS`, 'placeholder style anchor');

/* ── 7. sanity checks on the finished document ─────────────────────────── */
for (const banned of ['x-dc', 'support.js', 'image-slot', 'unpkg.com', '_ds/', 'DCLogic', 'data-dc-script']) {
  if (html.includes(banned)) throw new Error(`build failed: "${banned}" still present in output.`);
}
if (!html.includes('<!DOCTYPE html>') || !html.includes('</html>')) {
  throw new Error('build failed: output is not a complete document.');
}

/* ── 8. write dist/ ─────────────────────────────────────────────────────── */
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

const bytes = (p) => fs.statSync(p).size;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(OUT);
const total = files.reduce((n, f) => n + bytes(f), 0);

console.log('High Lane — static build');
for (const s of steps) console.log('  ·', s);
console.log(`\n  dist/index.html   ${(bytes(path.join(OUT, 'index.html')) / 1024).toFixed(1)} KB`);
console.log(`  ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB total`);
console.log('\n  output directory: dist');
