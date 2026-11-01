# Web App Template

A starting point for small static web apps that work offline:

- TypeScript 7 + Vite, no framework
- i18n without a library: English (default), Russian, Hebrew (RTL);
  detected from the browser, the choice kept in localStorage
- PWA: manifest, icons, a service worker that precaches the build
- TDD: Vitest (node + jsdom) and a Playwright smoke, offline included
- oxlint + prettier
- GitHub Actions: checks on every PR, GitHub Pages on `main`
- Mobile-first CSS with light and dark themes

The demo app is a counter: it shows plural forms in three languages, saved
state and the language switcher.

## Start a project from it

With Claude Code: `/new-web-app` (the skill renames everything and trims what
is not needed).

By hand:

```bash
gh repo create my-app --public --template dmitryweiner/web-app-template --clone
cd my-app
# rename: package.json name, index.html, manifest, footer link, i18n titles,
# the storage key test, dev/preview ports in scripts/lib/harness.mjs
npm ci && npm run check && npm run smoke
```

Then in the repository settings: Pages → Source: GitHub Actions.

## Development

```bash
fnm use            # Node from .node-version
npm ci
npm run dev        # dev server
npm run check      # typecheck + lint + unit tests
npm run smoke      # browser smoke (-- --preview for the build and offline)
npm run build      # → dist/
```

See [AGENTS.md](AGENTS.md) for the layout and conventions, [docs/](docs/)
for the documentation.

## License

[GPL-3.0-or-later](LICENSE).
