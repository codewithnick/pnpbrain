# Copilot Instructions for GCFIS

## Project Overview

GCFIS is a TypeScript monorepo for a customer-facing AI platform. It contains:
- Next.js apps: `apps/backend`, `apps/admin`, `apps/marketing`, `apps/widget`
- Shared packages: `packages/agent`, `packages/db`, `packages/tools`, `packages/types`
- Turborepo task orchestration at repo root

Primary goal: keep architecture modular, typed, and production-safe while shipping features quickly.

## Core Technology Stack

- TypeScript (strict mode)
- Next.js App Router
- Drizzle ORM + PostgreSQL
- LangChain / LangGraph for agent orchestration
- Turbo + pnpm workspaces

## Monorepo Structure Rules

- Keep app-specific logic inside each app under `apps/*`.
- Keep reusable, cross-app logic in `packages/*`.
- Prefer package exports over deep imports. Only import from paths exposed in each package `exports` map.

## Engineering Principles

- KISS and DRY first.
- Prefer composition over inheritance.
- Use OOP where state, lifecycle, or behavior coordination is complex.
- Keep functions and methods focused and small.
- Design for testability: inject dependencies, avoid hidden globals.
- Fail fast for invalid config; degrade gracefully for optional features.
- Add concise comments only where intent is not obvious.

## OOP Architecture Guidelines (Mandatory)

Use class-based services for domain behavior and orchestration.

### Preferred Pattern

1. **Routes / API handlers**
  - Validate input
  - Call controller/service methods
  - Map errors to HTTP responses

2. **Controllers (app layer)**
  - Coordinate request-level workflows
  - No direct third-party SDK calls unless wrapped in package services

3. **Services (domain layer)**
  - Class-based modules encapsulating business operations
  - Constructor-based dependency injection
  - No framework-specific coupling

4. **Repositories / DB access (data layer)**
  - Encapsulate Drizzle queries
  - Return typed entities/DTOs

5. **Tools / adapters (integration layer)**
  - Wrap external APIs and third-party tool behavior

### OOP Conventions

- One primary responsibility per class.
- Use interfaces/types for constructor dependencies.
- Avoid static mutable state.
- Keep public API small; mark internals `private`/`protected`.
- Preserve backward compatibility with function wrappers when refactoring shared packages.

## Package Ownership

- `packages/agent`: agent orchestration, prompts, memory extraction, RAG retrieval.
- `packages/db`: database client and schema definitions.
- `packages/tools`: reusable tool adapters (calculator, datetime, firecrawl, etc.).
- `packages/types`: shared contracts and DTOs.

Do not place app-specific business logic inside shared packages unless it is intentionally reusable.

## Coding Standards

- Follow ESLint and Prettier config present in repo.
- Maintain strict TypeScript compatibility.
- Use meaningful names:
  - PascalCase: classes/components/types
  - camelCase: variables/functions/methods
  - kebab-case: file names unless file exports a class best represented by PascalCase in code
- Keep cognitive complexity low; split methods rather than nesting logic deeply.

## API and Route Rules

- Routes should handle transport concerns only (request parsing, auth, response).
- Business logic belongs in controllers/services.
- Database queries should be centralized in repository/data-access classes or package modules.
- Never call external APIs directly from UI components.

## Database and Schema Rules

- Update `packages/db/src/schema/*` for schema changes.
- Keep migrations explicit, reversible where practical, and documented.
- Validate data assumptions before mutation.
- Add indexes for high-volume query paths.

## Agent and AI Rules

- Keep prompt templates in `packages/agent/src/prompts.ts`.
- Keep retrieval and memory concerns separated (RAG service vs Memory service).
- Tool selection should be explicit and auditable.
- Avoid hidden side effects in graph execution paths.

## Build, Test, and Quality Gates

Use root scripts:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm type-check
```

Before merging meaningful changes:
- Run lint and type-check.
- Run relevant app/package tests.
- Confirm package exports are updated when public APIs change.

## Feature Delivery Workflow

1. Clarify scope and impact.
2. Reuse existing packages/classes when possible.
3. Define/update contracts in `packages/types` first when needed.
4. Implement data layer, then service layer, then route/controller integration.
5. Validate with lint/type-check/tests.
6. Document only when the change affects architecture, contracts, or operations.

## Critical Do/Don't

Do:
- Refactor incrementally with compatibility shims.
- Keep package boundaries clear.
- Inject dependencies for easier testing.

Do not:
- Add unrelated architectural rewrites in feature PRs.
- Bypass package exports with deep imports.
- Mix transport, business, and persistence logic in one module.
