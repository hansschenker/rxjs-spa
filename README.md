# rxjs-spa

An **npm workspaces** monorepo for building **single page applications** using **RxJS + TypeScript**.

- Apps: `apps/*` (Vite SPAs)
- Libraries: `packages/*` (Vite library mode, ESM+CJS + types)
- Docs: `docs/` (VitePress)
- Tests: Vitest (workspace runner)

## Requirements

- Node.js >= 18 (recommended: Node 20+)
- npm >= 9

## Quick start

```bash
npm install
npm run dev
```

### Run one workspace

```bash
npm -w apps/playground run dev
npm -w packages/core run test
npm -w docs run dev
```

## RxJS version policy

This repo **pins RxJS to exactly 7.8.2**:
- root `package.json` uses `overrides` to force it everywhere
- each workspace uses `"rxjs": "7.8.2"` (no caret)

## Structure

```
rxjs-spa/
  apps/
    playground/
  packages/
    core/
    dom/
    router/
  docs/
```

## Next steps (suggested)

- Add ESLint/Prettier
- Add Changesets for versioning/publishing if you want to publish packages
- Add more apps (examples, benchmarks, demos)

## npm note (workspace protocol)

This repo intentionally **does not** use `workspace:*` dependency specifiers.
`workspace:` is commonly supported by pnpm/yarn, but can error in npm.
Instead, the app depends on the local packages by matching their version (`0.1.0`).


## Vite monorepo dev note (no dist required)

Workspace packages export **TypeScript source** in dev mode using conditional exports:

- `development` -> `./src/index.ts` (so `vite dev` works without building packages first)
- `production/default` -> `./dist/index.js` (so `vite build` uses built output)

Vite supports `development/production` conditions when resolving package exports.
