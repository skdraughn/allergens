# MySafeMenu Website

The public MySafeMenu website contains the marketing homepage, download page,
support page, account-deletion instructions, and legal pages. It is maintained
as part of the MySafeMenu monorepo while keeping its own dependency lockfile.

## Prerequisites

- Node.js `>=22.13.0`

## Run From The Monorepo Root

```bash
npm --prefix website install
npm run website:dev
npm run website:build
npm run website:test
npm run website:lint
```

For website-only work, the same scripts can also be run directly inside
`website/` without affecting the app dependencies.
