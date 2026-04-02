# Action Plan: End-to-End Feature Verification and MCP Testing

## Objective

Verify every user-facing feature of the PNpbrain stack through the authenticated MCP API, identify real regressions, and fix any concrete bugs found in the runtime or prompt layer.

## What Was Verified Already

- The backend is reachable on `http://localhost:3011`.
- `GET /api/health` returns `200 OK`.
- The MCP server initializes successfully when the client sends both `Accept: application/json, text/event-stream` and the correct `x-api-key` header.
- `tools/list` returns the full MCP tool surface.
- `list_skills`, `list_integrations`, `list_knowledge`, `list_crawl_jobs`, `list_conversations`, and `get_business_config` all respond correctly.
- A live `chat` call successfully returned a calculator answer and persisted a conversation.

## Bug Found and Fixed

### Prompt Tool-Name Mismatch

The agent system prompt was referencing several tool names incorrectly. The runtime tool names are:

- `calculator`
- `get_datetime`
- `firecrawl_scrape`
- `qualify_lead`
- `route_qualified_lead`
- `propose_meeting_slots`
- `book_company_meeting`

The prompt had older names like `qualify_lead`, `propose_meeting_slots`, and `book_company_meeting` mixed with incorrect guidance. That mismatch weakens tool selection and can cause the model to answer from memory when it should call a tool.

### Fix Applied

Updated `packages/agent/src/prompts.ts` to explicitly name the real tools and to give direct usage instructions for:

- time/date requests -> `get_datetime`
- math/pricing/ROI -> `calculator`
- lead scoring -> `qualify_lead`
- lead handoff -> `route_qualified_lead`
- scheduling -> `propose_meeting_slots` then `book_company_meeting`
- web ingestion -> `firecrawl_scrape`

## End-to-End Feature Matrix

### 1. MCP Transport and Auth

Test the protocol layer before any business logic.

Checks:

- `POST /mcp` with no `x-api-key` returns a clear auth error.
- `POST /mcp` with the right key and the required `Accept` header initializes successfully.
- `tools/list` returns the expected tool catalog.
- Invalid method names or malformed JSON-RPC bodies fail cleanly.

Pass criteria:

- No transport errors.
- Correct auth boundary behavior.
- Stable JSON-RPC responses.

### 2. Business and Agent Configuration

Verify the authenticated agent identity and runtime config.

Checks:

- `get_business_config` returns the correct business and agent IDs.
- `list_skills` returns the available built-in skills and the enabled subset.
- `list_integrations` returns the integration state, including meeting and support context.
- `update_enabled_skills` persists changes and is reflected by a second `list_skills` call.

Pass criteria:

- The key maps to a real business and agent.
- Skill changes are durable.
- Integration state matches DB-backed config.

### 3. Chat Core

Verify the main conversational path.

Checks:

- Basic greeting and product explanation.
- Follow-up clarification when the question is ambiguous.
- Conversation thread creation on first use.
- Thread continuation when `threadId` is supplied.
- Conversation persistence after the reply is generated.

Pass criteria:

- The model returns a coherent answer.
- A `threadId` is created and can be reused.
- Conversation history shows the exchange.

### 4. Calculator Skill

Use prompts that should force arithmetic.

Test cases:

- `What is 2 + 2?`
- `What is 500 * 149?`
- `What is the annual cost of $149/month?`
- `If we save 35% of $42,000, what is the savings?`

Pass criteria:

- The result includes the exact math output.
- The answer is not just a generic acknowledgment.

### 5. Date and Time Skill

Use prompts that require current time or timezone conversion.

Test cases:

- `What is the current date and time in UTC?`
- `What time is 10 AM Singapore in New York?`
- `What is tomorrow at 6 PM Asia/Singapore in UTC?`

Pass criteria:

- The response includes an actual timestamp or conversion.
- Invalid timezone input is handled with a clear error.

### 6. Lead Qualification and Handoff

Use prompts with company size, budget, urgency, and pain points.

Test cases:

- Mid-market SaaS with support pressure.
- Enterprise prospect with short timeline.
- Budget-sensitive buyer asking for pricing fit.

Pass criteria:

- The agent gives a sensible qualification response.
- If qualification is high, lead handoff routing is triggered when configured.

### 7. Meeting Scheduling

Use prompts that ask for slots or booking.

Test cases:

- `Can I book a demo?`
- `What times are available tomorrow?`
- `I want a 30-minute meeting next week.`

Pass criteria:

- The agent proposes slots or confirms booking behavior.
- Meeting integration context is respected.

### 8. Support Escalation

Use prompts that are too technical or need a human.

Test cases:

- Custom API schema questions.
- Billing dispute or payment issue.
- Feature gap that should create a support ticket.

Pass criteria:

- The agent escalates when the issue is out of scope.
- A ticket is created only when support is configured.

### 9. Firecrawl and Knowledge Ingestion

Verify content indexing and retrieval support.

Test cases:

- List current documents.
- Add a knowledge URL on an allowed domain.
- Trigger a crawl job.
- List crawl jobs after enqueue.

Pass criteria:

- Knowledge documents are listed or created correctly.
- Crawl jobs enqueue or fail with a clear operational error.

### 10. Conversation Retrieval

Verify the history APIs behind the MCP tools.

Test cases:

- `list_conversations` with a limit.
- `get_conversation` for a known thread.

Pass criteria:

- Conversation metadata is present.
- Message history is ordered and scoped correctly.

### 11. Admin and Dashboard Surface

Feature area to check in the UI after MCP verification.

Pages to review:

- login and signup
- onboarding
- dashboard home
- agents
- skills
- integrations
- conversations
- knowledge
- billing
- memory
- theme/profile/settings

Pass criteria:

- Pages load without runtime errors.
- State shown in the UI matches the API/MCP responses.

### 12. Widget and Public Surface

Feature area to check after backend validation.

Checks:

- Widget embeds and loads the chat surface.
- Public marketing pages render correctly.
- Public chat flows respect the current agent configuration.

Pass criteria:

- No console/runtime errors.
- The widget can reach the backend and display replies.

## MCP Test Sequence Used

1. `initialize`
2. `tools/list`
3. `tools/call:list_skills`
4. `tools/call:list_integrations`
5. `tools/call:update_enabled_skills`
6. `tools/call:chat` with a calculator prompt
7. `tools/call:list_conversations`
8. `tools/call:get_business_config`
9. `tools/call:list_knowledge`
10. `tools/call:list_crawl_jobs`
11. `tools/call:chat` with a datetime prompt

## Test Results So Far

- MCP auth and negotiation: pass
- Tool catalog visibility: pass
- Skill listing and update: pass
- Conversation persistence: pass
- Business config retrieval: pass
- Knowledge listing: pass
- Crawl job listing: pass
- Calculator chat: pass
- Date/time chat: partial pass before prompt fix, now expected to improve after prompt update

## Acceptance Criteria

The work is complete when all of these are true:

- The authenticated MCP API can initialize and list tools.
- All built-in skills are testable through `chat` or direct MCP tools.
- Conversation history persists and is retrievable.
- Knowledge, crawl, and integration tools return valid responses.
- The prompt uses the real tool names, so the model is not guided by stale names.
- No new TypeScript or lint errors are introduced.

## Follow-Up Items

- Re-run the `chat` test for the datetime prompt after the prompt fix.
- Re-run the lead qualification and scheduling prompts to confirm better tool selection.
- Decide whether the current agent provisioning should auto-enable a default skill set or whether that remains an admin-only configuration step.
