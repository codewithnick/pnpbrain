# Frontend Integration Plan (Plug-and-Play)

## Goal
Enable customers to use the PNpbrain agent backend with any frontend stack while keeping onboarding simple and secure.

## Integration Options We Should Offer

| Option | Best For | Transport | Auth | Status |
| --- | --- | --- | --- | --- |
| Script widget | Fastest website launch | WebSocket with SSE fallback | `publicToken` | Available |
| Hosted public chat page | Shareable support/sales chat URL | WebSocket with SSE fallback | `publicToken` | Available |
| Custom web app (REST stream) | Next.js/React/Vue/Svelte/Angular teams that prefer HTTP streaming | SSE (`POST /api/agent/chat`) | `publicToken` or `x-api-key` | Available |
| Custom web app (WebSocket) | Real-time rich UIs | WebSocket (`/ws/agent`) | `publicToken` or `x-api-key` | Available |
| Native channel bot | Telegram, WhatsApp, Slack, Discord, Teams | Webhook + API forwarding | `x-api-key` on server | Available |
| IDE/automation tools | Developer tooling and workflows | MCP (`POST /mcp`) | `x-api-key` | Available |
| CMS plugin | WordPress users | Script/widget integration | `publicToken` | Available |
| Native mobile SDK | iOS/Android apps | HTTP/WebSocket | `publicToken` (public), scoped keys for privileged flows | Planned |
| Server-side SDK | Node/Python backend orchestration | HTTP/MCP | `x-api-key` | Planned |

## Systematic Implementation Framework

### Phase 1: Transport Parity (Now)
- Keep WebSocket as primary low-latency stream transport.
- Keep SSE as first-class fallback for environments where WebSocket is blocked.
- Ensure all first-party UIs implement automatic fallback and thread continuity.

### Phase 2: Unified Client Contracts
- Publish shared request/response contracts for chat stream events and errors.
- Add compatibility guarantees for event types (`token`, `step`, `thinking`, `reasoning`, `done`, `error`).
- Add versioned transport documentation with migration notes.

### Phase 3: SDK Layer
- Build `@pnpbrain/web-sdk`:
  - `createChatClient({ backendUrl, publicToken, agentId? })`
  - auto-select transport (WebSocket -> SSE)
  - stream callbacks and reconnection helpers
- Build `@pnpbrain/server-sdk`:
  - secure key-based calls for backend workflows
  - strict typed APIs for chat + conversation history

### Phase 4: Channel Starter Kits
- Next.js App Router starter.
- React + Vite starter.
- Vue/Nuxt starter.
- SvelteKit starter.
- Angular starter.
- React Native starter.
- Telegram bot starter.
- WhatsApp webhook starter.
- Slack app starter.
- Discord bot starter.
- Teams bot starter.

### Phase 5: Partner Integrations
- Shopify app extension.
- Webflow script installer.
- Wix embed helper.
- Zapier/Make action for "Send to PNpbrain agent".
- Email inbound/outbound connector.

## Integration Product Requirements

### Auth and Security
- Public clients use short, scoped `publicToken`.
- Admin/server clients use `x-api-key`.
- Domain allowlist enforcement for browser-originated public traffic.
- Agent scoping rules prevent cross-business thread reuse.

### Reliability
- Transport fallback in clients (WebSocket -> SSE).
- Uniform error envelope and retry guidance.
- Idempotent thread continuation using `threadId`.

### Observability
- Transport type emitted in logs/analytics.
- Track success/failure by channel (`widget`, `public_chat`, `websocket`, `sse`, `mcp`).
- Monitor fallback rate to detect infrastructure/network issues.

## Immediate Backlog
1. Expose and maintain both stream transports in backend chat API.
2. Add transport fallback in all first-party clients.
3. Publish a frontend-agnostic API integration guide with code examples per framework.
4. Introduce a web SDK package to remove duplicate transport handling logic.
5. Add synthetic tests that validate WebSocket and SSE parity for identical prompts.

## Definition of Done for "Any Frontend"
- A developer can integrate in under 15 minutes with one of:
  - script widget,
  - WebSocket API,
  - SSE API,
  - MCP/API key for tooling.
- All options share the same agent behavior and conversation continuity.
- First-party examples exist for at least 4 major frontend frameworks.
- First-party examples also exist for at least 4 messaging channels.
