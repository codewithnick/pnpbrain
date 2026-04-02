# PNPBrain — Development & Contribution Guide

## Prerequisites

- Node.js 20+
- pnpm
- Docker (for local Supabase)
- Ollama with the required model (see root `README`)

---

## Getting Started

```bash
# Install all dependencies
pnpm install

# Start all apps in dev mode (from repo root)
pnpm dev
```

Each app runs on its own port. Check individual `apps/*/package.json` for port assignments.

---

## Key Rules

- **Backend is the source of truth.** All agent behavior lives in `apps/backend`. Test changes there first before touching the frontend.
- **No raw LLM calls from the frontend.** Every AI request must go through the backend API.
- **Use strict TypeScript.** `strict: true` is enforced via `tsconfig.base.json`. Do not disable it.
- **JSDoc on LangGraph nodes.** Every node in `packages/agent` must have a JSDoc comment describing its input, output, and side effects.

---

## Adding a New Tool / Skill

1. Define the tool in `packages/tools/` with a typed input/output schema.
2. Export it from `packages/tools/index.ts`.
3. Register the tool in the LangGraph graph inside `packages/agent/`.
4. Add any required admin config (e.g., API key field, allowed domain list) to `apps/admin`.
5. Document the tool in `docs/ARCHITECTURE.md` under the tools table.

---

## Adding a New LangGraph Node

1. Create the node file under `packages/agent/nodes/`.
2. Add JSDoc: `@param state`, `@returns updated state`, and any side effects.
3. Connect it in the graph definition (`packages/agent/graph.ts`).
4. Write a unit test alongside the node file.

---

## Ollama Setup

Run the required model locally before starting the backend:

```bash
ollama pull <model-name>   # see root README for the exact model
ollama serve
```

The backend reads `OLLAMA_BASE_URL` and `OLLAMA_MODEL` from `.env`.

---

## Environment Variables

Copy `.env.example` to `.env` at the repo root and fill in the values:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=<model>
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
FIRECRAWL_API_KEY=...
LLM_PROVIDER=ollama   # switch to 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'huggingface' | 'openrouter' for production
```

---

## Code Style

- Prettier config: `.prettierrc` at repo root.
- Run `pnpm format` before committing.
- TypeScript errors must be zero before opening a PR.

---

## Security Checklist (per PR)

- [ ] No secrets or API keys committed.
- [ ] All tool calls validated and restricted to owner-approved domains.
- [ ] New API routes are authenticated and rate-limited.
- [ ] No LLM calls exposed directly from any frontend app.
