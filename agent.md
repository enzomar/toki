# Agent Guidance

This file exists to keep operational docs and deployment files aligned with the codebase.

## Core rules

- Keep [README.md](README.md), [Makefile](Makefile), and [vercel.json](vercel.json) in sync when deployment or developer workflows change.
- If you add or rename environment variables, update both [README.md](README.md) and [.env.example](.env.example) in the same change.
- If you change pricing units, currency behavior, or cost formulas, update both [README.md](README.md) and this file.
- If you change the user-facing estimation flow, update the README language so it still matches the UI.

## Environment config invariants

- `VITE_PAYPAL_DONATE_URL` drives the small PayPal heart icon in the header.
- The author-contact icon opens an in-app dialog that posts to the hardcoded Formspree form `xzdwwwzv`.

## Product invariants

- Toki has two alternative modes, not one linear wizard:
  - Quick estimate mode
  - Detailed forecast mode
- Quick estimate mode is a rough business estimate.
- Detailed forecast mode is the stronger architecture-driven estimate.
- The answer section should make it clear which mode produced the current result.

## Pricing invariants

- Model and embedding rates are stored per 1M tokens.
- Currency selection is a display choice for labels and formatted totals.
- Currency selection does not auto-convert numeric price inputs.
- Any future pricing UI must state units clearly.

## Deployment invariants

- The app is deployed as a static Vite build.
- Vercel should build with `npm run build` and publish `dist/`.
- Local operational shortcuts should remain available through the Makefile.

## Validation expectations

- Run `npm run build` after changing source code, deployment config, pricing math, or core docs that depend on code behavior.
- If Makefile targets change, document them in [README.md](README.md).
- If new setup steps are introduced, add them to [README.md](README.md) immediately.

## Git hygiene expectations

- Do not commit `node_modules/`, `dist/`, `.vercel/`, or `*.tsbuildinfo`.
- Keep `.gitignore` aligned with generated artifacts.
