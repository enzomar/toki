# Toki

**Token Cost Calculator for Agentic AI Systems**

Toki estimates the monthly token consumption and cost of multi-agent LLM architectures before you build them. It models agents, MCP tool calls, RAG retrieval, traffic routing, and prompt caching to produce a defensible budget estimate.

Created by **Vincenzo MARAFIOTI**

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Cost engine** | Real-time EUR cost calculation, cost per conversation, best/worst case range |
| **Agent modeling** | Input/output tokens per call, calls per conversation, history growth factor |
| **MCP tools** | Tool calls per conversation, input overhead (result fed back), output overhead |
| **RAG retrieval** | Chunks × tokens per chunk, embedding token cost |
| **Prompt caching** | Configurable cache hit rate (90% discount on cached input portion) |
| **Traffic routing** | Edge weights as absolute traffic probabilities, multi-agent topology propagation |
| **Confidence** | Auto-scored High/Medium/Low with explanations of what's missing |
| **Topology** | Interactive SVG graph with bezier edges, traffic %, MCP/RAG badges, node inspector |
| **Token tool** | Text/JSON → token count converter, inline from agent fields or dedicated tab |
| **Export** | JSON workspace (re-importable), CSV, Excel (multi-sheet) |
| **Share** | One-click URL sharing (workspace encoded as base64 in query string) |
| **Help** | Embedded reveal.js presentation (13 slides) for pitching and onboarding |

---

## Supported Models

| Provider | Model | Input (€/1M) | Output (€/1M) |
|----------|-------|-------------|--------------|
| OpenAI | GPT-4.1 | €2.00 | €8.00 |
| OpenAI | GPT-4.1 Mini | €0.40 | €1.60 |
| OpenAI | GPT-4.1 Nano | €0.10 | €0.40 |
| OpenAI | GPT-4o | €2.50 | €10.00 |
| OpenAI | GPT-4o Mini | €0.15 | €0.60 |
| OpenAI | o3 (reasoning) | €2.00 | €8.00 |
| OpenAI | o4-mini (reasoning) | €1.10 | €4.40 |
| Anthropic | Claude Sonnet 4 | €3.00 | €15.00 |
| Anthropic | Claude Haiku 4 | €1.00 | €5.00 |
| Anthropic | Claude Opus 4 | €15.00 | €75.00 |

Custom models can be added from the Pricing tab with user-defined rates.

---

## Requirements

- Node.js 20+
- npm 9+

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
make dev

# Production build
make build

# Run tests
npm test

# Preview production build
make preview
```

---

## Deployment

### Option 1: Vercel (external / public)

```bash
make vercel-login
make vercel-link
make deploy-prod
```

Vercel configuration is in `vercel.json`. Builds with `npm run build`, publishes `dist/`.

### Option 2: Forge (Amadeus internal)

Toki ships with a multi-stage Dockerfile optimized for Forge/OpenShift deployment.

```bash
# Build Docker image (tagged with package.json version)
make docker-build

# Test locally (http://localhost:8080)
make docker-run

# Push to Forge Artifactory registry
make docker-push
```

#### Forge Docker details

| Aspect | Implementation |
|--------|---------------|
| Base image | Amadeus RHEL (`docker-release.nce.dockerhub.rnd.amadeus.net/acs/rhel-init`) |
| Web server | nginx on port 8080 |
| User | Non-root (UID 1000), OpenShift SCC compliant |
| Health check | `GET /health` returns `{"status":"ok"}` |
| Static assets | Gzip compressed, 1-year cache on `/assets/` |
| SPA routing | All paths fall back to `index.html` |

#### Forge onboarding checklist

| Step | Status |
|------|--------|
| Git repository (corporate) | ✅ Done |
| Dockerfile (multi-stage, non-root, port 8080) | ✅ Done |
| OpenShift SCC compliant (random UID, no root) | ✅ Done |
| Health check endpoint (`/health`) | ✅ Done |
| nginx security headers (X-Frame, XSS, nosniff) | ✅ Done |
| `.dockerignore` | ✅ Done |
| Register in SIAM | ⬜ Pending |
| Security assessment | ⬜ Pending |
| Request onboarding (DG-NCE-Forge-Support) | ⬜ Pending |

#### Forge configuration values

| Field | Value |
|-------|-------|
| Tool name | `toki` |
| Domain | `toki.forge.amadeus.net` |
| Description | Token Cost Calculator for Agentic AI Systems |
| Container listening port | `8080` |
| Type | `office` |
| Personal data | None |
| Main technologies | TypeScript, React, Vite, nginx |

---

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make dev` | Start Vite dev server on 0.0.0.0:5173 |
| `make build` | Production build (TypeScript check + Vite) |
| `make preview` | Serve production build locally on :4173 |
| `make push MESSAGE="..."` | Bump patch version, commit, push to origin |
| `make docker-build` | Build Forge-ready Docker image |
| `make docker-run` | Run container locally on :8080 |
| `make docker-push` | Push image to Forge Artifactory registry |
| `make deploy-preview` | Vercel preview deployment |
| `make deploy-prod` | Vercel production deployment |

---

## Project Structure

```
src/
├── App.tsx                      # Main app (calculator, topology, pricing, token tool, help)
├── main.tsx                     # Entry point (MUI theme, error boundary)
├── components/
│   ├── ErrorBoundary.tsx        # Crash recovery UI
│   ├── TokenTool.tsx            # Token converter dialog + inline button
│   ├── atoms/TokiLogo.tsx       # Logo component
│   └── organisms/TopologyCanvas.tsx  # Interactive SVG topology graph
├── features/topology/
│   ├── types.ts                 # Domain types (Agent, Edge, EstimateConfig, etc.)
│   ├── config.ts                # Model options, pricing, samples
│   └── utils.ts                 # Cost calculation, traffic shares, import/export
├── hooks/
│   └── useLocalStorage.ts       # Persistent state with localStorage
├── test/
│   ├── setup.ts                 # Vitest + testing-library setup
│   └── App.test.tsx             # UI integration tests
public/
├── help.html                    # reveal.js presentation (13 slides)
├── toki-logo.png                # Logo asset
└── favicon.png                  # Browser favicon
```

---

## Accuracy & Confidence

| Scenario | Confidence | Expected accuracy |
|----------|-----------|-------------------|
| Single agent, measured token values | High | ±5–10% |
| Multi-agent with MCP tools | High | ±10–15% |
| Multi-agent with history growth | High | ±15–20% |
| Default values (not measured) | Medium | ±30–40% |

The cost engine is validated against manual calculation with zero delta (see `scripts/validate-accuracy.ts`).

### Known limitations

- No per-call variance modeling (all calls identical)
- Cache discount hardcoded at 90% (OpenAI gives 50%, Anthropic 90%)
- No rate limiting / retry cost beyond worst-case multiplier
- Global embedding price (same for all RAG agents)
- No fine-tuned model training cost
- No batch vs real-time pricing tiers

---

## Version Management

Each `make push` automatically bumps the patch version in `package.json` (e.g. 2.0.0 → 2.0.1). The version is injected at build time and displayed in the app footer.

---

## License

Internal tool — Amadeus proprietary.
