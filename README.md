# Toki

Toki is a Vite + React app for estimating token usage and cost for agentic systems.

It supports two alternative estimation modes:

- Quick estimate mode: a top-down business estimate from conversation volume, average token sizes, and model split.
- Detailed forecast mode: a bottom-up estimate from agents, handoffs, routing, and traffic assumptions.

## What the app includes

- Quick estimate mode for rough cost sizing.
- Detailed forecast mode for architecture-level modeling.
- A topology modal to visualize agents and handoffs.
- A pricing and model catalog with USD/EUR display support.
- Static Vercel deployment output via Vite.

## Requirements

- Node.js 18+
- npm 9+

## Local development

Install dependencies:

```bash
npm install
```

Start the app locally in dev mode:

```bash
make dev
```

By default this runs Vite on `0.0.0.0:5173`.

Build the app:

```bash
make build
```

Preview the production build locally:

```bash
make preview
```

## Makefile targets

- `make install`: install dependencies.
- `make dev`: start Vite in local dev mode.
- `make build`: run the production build.
- `make preview`: serve the production build locally.
- `make vercel-login`: authenticate the Vercel CLI.
- `make vercel-link`: link this folder to an existing or new Vercel project.
- `make deploy-preview`: create a preview deployment on Vercel.
- `make deploy-prod`: build locally, then create a production deployment on Vercel.
- `make push MESSAGE="..."`: add, commit, and push the current branch to `origin`.

`make push` is intentionally guarded: it stops if this folder is not a git repository or if the `origin` remote is missing.

## Deploying to Vercel

This repository includes [vercel.json](vercel.json), which tells Vercel to:

- use the Vite framework preset
- build with `npm run build`
- publish the `dist/` folder

### Option 1: Deploy from a Git repository

Recommended when you want Vercel to redeploy automatically after each push.

1. Initialize git if needed.
2. Add a remote repository.
3. Push the code:

```bash
make push MESSAGE="chore: initial deploy setup"
```

4. Import the repository in Vercel.

### Option 2: Deploy with the Vercel CLI

```bash
make vercel-login
make vercel-link
make deploy-preview
make deploy-prod
```

## Pricing note

- Model input, output, and embedding prices are stored per 1M tokens.
- The USD/EUR selector changes labels and formatted output only.
- Switching currency does not auto-convert existing numeric price values.

## Repo hygiene

The repository includes [.gitignore](.gitignore) entries for:

- `node_modules/`
- `dist/`
- `.vercel/`
- TypeScript build info files

## Maintenance guidance

See [agent.md](agent.md) for repository-specific instructions that future coding agents should follow when they modify deployment files, docs, pricing behavior, or developer tooling.
