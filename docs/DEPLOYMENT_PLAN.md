# PNPBRAIN Deployment Plan

## 1. Goals

- Deploy all production services with minimal downtime and clear rollback paths.
- Enforce quality gates (`lint`, `type-check`, build, smoke tests) before release.
- Separate infrastructure and release processes for frontend apps vs backend workers.
- Ensure observability, incident response, and post-deploy verification are in place.

## 2. Scope

Deployable units in this monorepo:

- `apps/backend` (Express API, MCP endpoints, agent orchestration)
- `apps/admin` (Next.js admin dashboard)
- `apps/marketing` (Next.js public site)
- `apps/widget` (Next.js app + `build:embed` artifact)
- `apps/crawl-worker` (background ingestion worker)
- `apps/wp-plugin` (WordPress distribution package)

Shared packages (`packages/*`) are built and versioned through monorepo pipelines and deployed indirectly through app releases.

## 3. Environment Strategy

Three environments:

1. `dev` (local + shared cloud dev)
2. `staging` (production-like, required for release validation)
3. `prod` (customer traffic)

Per-environment requirements:

- Isolated database and Redis instances.
- Separate API keys/tokens for external integrations.
- Distinct frontend URLs and CORS allowlists.
- Explicit backend base URL used by admin/widget/marketing.

## 4. Release Architecture

Recommended target architecture:

- Frontends (`admin`, `marketing`, `widget`) deployed as independent Next.js services.
- Backend and crawl worker deployed as containerized services.
- Managed Postgres (with pgvector enabled) and managed Redis.
- Object storage for uploads/exports.
- Centralized secret manager for environment variables.
- Centralized logging + metrics + alerting.

## 4.1 Concrete Hosting Targets (Recommended)

Use this as the default production topology:

1. Frontend hosting (Vercel):
   - `apps/marketing` on `pnpbrain.com`
   - `apps/admin` on `admin.pnpbrain.com`
   - Optional hosted widget playground from `apps/widget` on `widget.pnpbrain.com`
2. API and bot runtime (AWS ECS Fargate):
   - `apps/backend` as container service behind ALB on `api.pnpbrain.com`
   - `apps/crawl-worker` as separate ECS service (no public ingress)
3. Data and queue:
   - Managed Postgres with pgvector (Supabase or RDS Postgres + pgvector)
   - Managed Redis (Upstash or ElastiCache)
4. CDN and static distribution:
   - Widget embed bundle (`apps/widget` -> `build:embed`) uploaded to S3
   - CloudFront in front of S3 for global delivery at `cdn.pnpbrain.com`
5. DNS + TLS:
   - Cloudflare DNS for all records and certificate management
   - A/AAAA/CNAME records mapped to Vercel, ALB, and CloudFront targets

## 4.2 Domain, DNS, and CDN Mapping

Required production records:

1. `pnpbrain.com` -> Vercel project for `apps/marketing`
2. `www.pnpbrain.com` -> redirect to `pnpbrain.com`
3. `admin.pnpbrain.com` -> Vercel project for `apps/admin`
4. `api.pnpbrain.com` -> AWS ALB for `apps/backend`
5. `cdn.pnpbrain.com` -> CloudFront distribution serving widget bundles
6. `widget.pnpbrain.com` -> optional Vercel project for standalone widget app

CDN usage rule:

- Third-party customer sites should load only versioned widget scripts from `cdn.pnpbrain.com` (example path style: `/widget/v1/pnpbrain-widget.js`).
- Keep long cache TTL for versioned assets and short/no-cache for a mutable `latest` alias.

## 5. CI/CD Pipeline

Single pipeline with path filtering and monorepo caching.

Quality gates (block release if any fail):

1. Install dependencies with locked versions.
2. `pnpm lint`
3. `pnpm type-check`
4. `pnpm build`
5. Run targeted tests/smoke checks:
   - backend API health + auth smoke test
   - admin login route smoke test
   - marketing landing page smoke test
   - widget embed initialization smoke test

Artifact outputs:

- Backend container image
- Crawl worker container image
- Next.js build artifacts per app
- Widget embed bundle (`build:embed`)
- WordPress plugin zip package (when release tag is created)

## 6. Secrets and Configuration

Required configuration classes:

- Core runtime: `NODE_ENV`, app ports, public URLs
- Data stores: Postgres URL, Redis URL
- Auth: Supabase keys, JWT/token secrets
- AI/agent: model provider, model API keys, MCP auth settings
- Integrations: Firecrawl, Calendly, Zendesk, Razorpay, Stripe
- Observability: logging sink tokens, tracing/metrics keys

Rules:

- No secrets in repo or build logs.
- Rotate prod secrets on a schedule and on incident.
- Validate required env vars at service startup (fail fast).

## 7. Deployment Order

For each release candidate:

1. Apply database migrations on staging.
2. Deploy backend to staging.
3. Deploy crawl worker to staging.
4. Deploy admin, widget, and marketing to staging.
5. Run staging smoke suite + manual checks.
6. Promote the same artifacts to production.

Production rollout sequence:

1. Run production DB migration in maintenance-safe mode.
2. Deploy backend with rolling or blue/green strategy.
3. Deploy crawl worker (graceful restart to avoid job loss).
4. Deploy frontends.
5. Publish widget embed artifact to CDN.
6. Publish WordPress plugin package (if part of release).

## 8. Database Migration Plan

Migration policy:

- Backward-compatible schema changes first.
- Code that uses new fields released only after migration success.
- Destructive changes delayed to a later cleanup release.

Release pattern:

1. Expand schema (additive changes).
2. Deploy compatible application code.
3. Backfill data as needed.
4. Contract schema in later release.

## 9. Verification Checklist

Automated post-deploy checks:

- `/health` and critical backend endpoints return expected status.
- MCP endpoint responds with auth enforced.
- Chat request round-trip succeeds for a test business.
- Widget embed loads and sends first message successfully.
- Admin dashboard loads and authenticated routes work.
- Crawl worker processes one test job successfully.

Manual spot checks:

- Integration connectivity status visible in admin.
- Conversation and memory persistence in database.
- Error/latency dashboards are receiving fresh telemetry.

## 10. Rollback Strategy

Rollback triggers:

- Elevated 5xx rate
- p95 latency regression over threshold
- Authentication or chat flow failures
- Broken widget initialization in production

Rollback actions:

1. Frontends: immediate redeploy of previous artifact.
2. Backend/worker: roll back to previous container image.
3. Feature flags: disable newly introduced features.
4. DB: if migration is non-reversible, keep expanded schema and roll back app code only.

## 11. Monitoring and Alerting

Minimum production dashboards:

- Backend request volume, error rate, latency (p50/p95/p99)
- Queue depth and job failure rate (worker)
- DB connection saturation and slow queries
- Integration error counts by provider
- Widget session starts and first-response latency

Alerts:

- High 5xx rate
- Sustained latency breach
- Worker failure spikes
- DB/Redis connectivity errors
- Sudden drop in widget session volume

## 12. Release Cadence and Controls

- Weekly scheduled release window for non-urgent changes.
- Hotfix lane for production incidents.
- Require change summary and rollback notes in every release PR.
- Tag releases and keep deployment changelog per environment.

## 13. Ownership Model

- Platform owner: CI/CD, infra, secrets, observability.
- Backend owner: API, agent flow, migrations, worker health.
- Frontend owner: admin/marketing/widget behavior and embed integrity.
- QA owner: staging sign-off and post-deploy verification.

## 14. 30-Day Execution Plan

Week 1:

- Finalize environment matrix and secret inventory.
- Implement CI quality gates and artifact outputs.
- Add health/smoke scripts for all deployable apps.

Week 2:

- Stand up/validate staging parity with production topology.
- Wire centralized logging, metrics, and alerts.
- Run first full staging dress rehearsal.

Week 3:

- Implement production deployment workflows and rollback automation.
- Test migration strategy with non-trivial schema change.
- Validate widget CDN publishing flow.

Week 4:

- Execute first controlled production release using this runbook.
- Run postmortem-style review and tighten weak points.
- Freeze this document as v1 and track future revisions.
