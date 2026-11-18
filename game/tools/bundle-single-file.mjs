// ══════════════════════════════════════════════════════════
// Single-file packager
//
// Folds `vite build` output into ONE self-contained .html with no
// external requests at all: CSS and JS inlined, and the two Google
// fonts downloaded and embedded as base64 woff2.
//
// This exists because the hosting targets that need zero setup
// (a Claude Artifact, an email attachment, a USB stick) all enforce
// a strict CSP that blocks fonts.googleapis.com and any CDN. The
// normal `dist/` output is still the right thing to push to a real
// static host — this is the portable copy.
//
//   node tools/bundle-single-file.mjs
//   → dist-single/mozzarela.html
// ══════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out  = join(root, 'dist-single');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120 Safari/537.36';

const FONT_CSS =
  'https://fonts.googleapis.com/css2' +
  '?family=Cinzel:wght@600;700' +
  '&family=EB+Garamond:ital,wght@0,400;0,600;1,400' +
  '&display=swap';

/**
 * Fetch the font CSS, keep only the Latin subsets, and swap every
 * remote woff2 for an inline data: URI.
 */
async function embedFonts() {
  const res = await fetch(FONT_CSS, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`font css ${res.status}`);
  const css = await res.text();

  // Each @font-face carries a unicode-range comment block. Latin and
  // latin-ext are the only ones this game's copy needs; the Cyrillic,
  // Greek and Vietnamese subsets would triple the payload.
  const blocks = css.split('@font-face').slice(1)
    .map(b => '@font-face' + b.slice(0, b.indexOf('}') + 1));

  const keep = blocks.filter(b => {
    const m = b.match(/unicode-range:\s*([^;]+);/);
    if (!m) return true;
    const r = m[1];
    return r.includes('U+0000-00FF') || r.includes('U+0100-02AF');
  });

  let embedded = 0, bytes = 0;
  const done = [];
  for (const block of keep) {
    const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!url) { done.push(block); continue; }
    const font = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!font.ok) { done.push(block); continue; }
    const buf = Buffer.from(await font.arrayBuffer());
    bytes += buf.length;
    embedded++;
    done.push(block.replace(
      /url\(https:\/\/[^)]+\.woff2\)/,
      `url(data:font/woff2;base64,${buf.toString('base64')})`
    ));
  }

  console.log(`  fonts: ${embedded} subsets embedded (${(bytes / 1024).toFixed(0)} KB)`);
  return done.join('\n');
}

function pick(ext) {
  const dir = join(dist, 'assets');
  const f = readdirSync(dir).find(n => n.endsWith(ext));
  if (!f) throw new Error(`no ${ext} in dist/assets — run \`npm run build\` first`);
  return readFileSync(join(dir, f), 'utf8');
}

console.log('Packaging single-file build…');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css  = pick('.css');
const js   = pick('.js');
const fontCss = await embedFonts();

let doc = html
  // Drop every external stylesheet/preconnect — nothing may leave the page.
  .replace(/<link[^>]*rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/g, '')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>\s*/g, '')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '');

// Three sequences can terminate or corrupt a <script> element. All are
// produced incidentally by minification, none are meaningful JS here:
//   </script  closes the element
//   <!--      opens HTML "script data escaped" state  (from `a < !--b`)
//   -->       closes it                               (from `i-- > 0`)
// Spacing them apart is semantically identical JS.
const safeJs = js
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '< !--')
  .replace(/-->/g, '-- >');

// NOTE: the replacements MUST be functions, not strings. A string
// replacement expands `$&`, `$'` and "$`" as special patterns, and
// minified JS is full of `$` followed by a backtick — which expands
// to "everything before the match", i.e. it splices the whole HTML
// document into the middle of the bundle. Silent, and baffling.
doc = doc
  .replace('</head>', () => `<style>${fontCss}\n${css}</style>\n</head>`)
  .replace('</body>', () => `<script type="module">${safeJs}</script>\n</body>`);

mkdirSync(out, { recursive: true });
const file = join(out, 'mozzarela.html');
writeFileSync(file, doc);

// ── Fragment variant ──────────────────────────────────────
// A Claude Artifact supplies its own <!doctype>/<html>/<head>/<body>
// and wraps whatever it is given. Handing it a complete document
// would nest <html> inside <body>, so this variant emits only the
// page contents: the style block, the markup, and the module.
const bodyInner = doc
  .slice(doc.indexOf('<body>') + '<body>'.length, doc.lastIndexOf('</body>'));
const styleBlock = doc.slice(doc.indexOf('<style>'), doc.indexOf('</style>') + '</style>'.length);

const fragment = `${styleBlock}\n${bodyInner}`;
const fragFile = join(out, 'mozzarela-artifact.html');
writeFileSync(fragFile, fragment);
console.log(`  wrote ${fragFile} (${(Buffer.byteLength(fragment) / 1024).toFixed(0)} KB, fragment)`);

for (const tag of ['<!DOCTYPE', '<html', '<head', '<body']) {
  if (fragment.toLowerCase().includes(tag.toLowerCase())) {
    console.error(`  ✗ fragment still contains ${tag}`);
    process.exit(1);
  }
}
console.log('  ✓ fragment carries no document wrapper');

const kb = (Buffer.byteLength(doc) / 1024).toFixed(0);
console.log(`  wrote ${file} (${kb} KB)`);

// Fail loudly rather than shipping something that will silently
// break behind a strict CSP.
const leaks = doc.match(/(?:src|href)=["'](https?:)?\/\//g) || [];
if (leaks.length) {
  console.error(`  ✗ ${leaks.length} external reference(s) still present`);
  process.exit(1);
}
console.log('  ✓ zero external references');
