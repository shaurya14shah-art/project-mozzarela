# Hosting The Fracture

The game is **pure static output** — no server, no database, no API keys.
Anything that can serve a folder can host it, forever, for free.

There are three copies, and they exist for different reasons.

| Build | Command | What it's for |
|---|---|---|
| `dist/` | `npm run build` | Normal static hosting. Fastest to load (separate cacheable JS/CSS). |
| `dist-single/mozzarela.html` | `npm run bundle` | One self-contained file. No external requests at all — works from a USB stick, an email attachment, or `file://`. |
| `dist-single/mozzarela-artifact.html` | `npm run bundle` | Same, minus the `<html>/<head>/<body>` wrapper, for embedding somewhere that supplies its own document. |

The single-file builds inline the CSS, the JS **and** the two typefaces
(Cinzel and EB Garamond, Latin subsets, as base64 `woff2`). The packager
fails the build if any external reference survives, so those files can
never silently degrade behind a strict content-security policy.

---

## Already live

**Claude Artifact** — published from this repo, private to your account
until you share it:

<https://claude.ai/code/artifact/cef54840-2356-415b-a6df-ae111678508c>

To update it after changing the game:

```bash
npm run bundle
```

then re-publish `dist-single/mozzarela-artifact.html` to that same URL.

---

## Hosting it independently

An artifact lives inside Claude. For a URL that is yours and outlives
any one tool, use a static host. All three below are free for a project
this size and none of them need a card.

### Netlify — no CLI, no repo

1. Run `npm run build`.
2. Open <https://app.netlify.com/drop>.
3. Drag the `dist` folder onto the page.

You get a permanent `*.netlify.app` URL immediately. `netlify.toml` in
this folder already sets the SPA redirect and cache headers, so a
connected repo will build correctly too.

### GitHub Pages — versioned, tied to the repo

```bash
git init && git add -A && git commit -m "The Fracture"
gh repo create mozzarela --public --source=. --push
```

Then in **Settings → Pages**, set the source to **GitHub Actions**. The
workflow at `.github/workflows/deploy.yml` builds and publishes on every
push to `main`.

### Vercel

```bash
npx vercel --prod
```

Accept the defaults; it detects Vite and publishes `dist`.

---

## Why I didn't do these for you

Each of them requires signing in to an account that is yours. Creating
accounts or entering your credentials isn't something I'll do on your
behalf — so the artifact above is the part I could genuinely host, and
these are one command each once you're signed in.

---

## Notes on the single-file build

Two things bit during packaging and are guarded against in
`tools/bundle-single-file.mjs`; both are worth knowing if you touch it.

- **`String.replace` with a string replacement expands `$&`, `` $` ``
  and `$'`.** Minified JS is full of `$` followed by a backtick, and
  `` $` `` means "everything before the match" — which spliced the whole
  HTML document into the middle of the bundle. The replacements are
  functions now, which disables that expansion.
- **Minifiers emit `-->` and `<!--`** incidentally, from `i-- > 0` and
  `a < !--b`. The HTML tokenizer reads those as comment delimiters and
  swallows the rest of the script. The packager spaces them apart,
  which is identical JavaScript.

Pointer lock is also requested defensively: sandboxed frames refuse it,
and the game falls back to hold-a-mouse-button-and-drag to look, saying
so once rather than leaving the camera apparently stuck.
