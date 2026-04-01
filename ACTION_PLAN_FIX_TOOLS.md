# Action Plan: Enable Visible Tool-Calling in PNPBrain Agent

**Issue**: Skills are enabled but not visually demonstrable because agent execution is failing  
**Goal**: Get the agent actually using tools so we can see them in action  
**Timeline**: 30-60 minutes to fix

---

## The Problem (Clear Diagnosis)

### What's Happening
```
User sends message via MCP chat → "Unsupported state or unable to authenticate data"
                                    ↓
                        Agent never executes
                                    ↓
                    Tools never get called
                                    ↓
                    No visible tool usage
```

### Root Cause
The MCP agent interface has an authentication or state issue that prevents:
1. Agent initialization
2. Graph execution
3. Tool invocation
4. Response generation

---

## Solution A: Fix MCP Chat (Recommended)

### Step 1: Debug the MCP Error

**File**: `apps/backend/src/mcp/server.ts`  
**Location**: The `chat` tool (around line 186)

Add logging to see where the error occurs:

```typescript
async ({ message, threadId }) => {
  console.log('[MCP/chat] Starting - user message:', message.substring(0, 50) + '...');
  
  try {
    // Resolve or create conversation
    let conversationId: string;
    
    console.log('[MCP/chat] Resolving conversation...');
    
    if (threadId) {
      console.log('[MCP/chat] Using existing thread:', threadId);
      const [existing] = await db.select(...).from(...);
      if (!existing) {
        console.log('[MCP/chat] Thread not found:', threadId);
        return { ... };
      }
      conversationId = existing.id;
    } else {
      console.log('[MCP/chat] Creating new conversation...');
      const [newConversation] = await db.insert(...).returning(...);
      conversationId = newConversation!.id;
    }
    
    console.log('[MCP/chat] Conversation ID:', conversationId);
    console.log('[MCP/chat] Persisting user message...');
    
    // Persist user message
    await db.insert(messages).values({...});
    
    console.log('[MCP/chat] Getting enabled skills...');
    const [enabledSkills, ...] = await Promise.all([...]);
    console.log('[MCP/chat] Enabled skills:', enabledSkills);
    
    console.log('[MCP/chat] Building graph input...');
    const graphInput = {...};
    
    console.log('[MCP/chat] Running graph...');
    const graphStream = runGraph(graphInput);
    
    let fullResponse = '';
    for await (const event of graphStream) {
      if (event.event === 'on_chat_model_stream') {
        const token = event.data?.chunk?.content as string;
        if (token) fullResponse += token;
      }
      // IMPORTANT: Log tool calls
      if (event.event === 'on_tool_call') {
        console.log('[MCP/chat] 🔧 TOOL CALLED:', {
          tool: event.data.tool,
          input: event.data.input,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    console.log('[MCP/chat] Response generated, persisting...');
    fullResponse = sanitizeAssistantReply(fullResponse);
    
    await db.insert(messages).values({...});
    
    console.log('[MCP/chat] ✅ Success');
    
    return {
      content: [{type: 'text', text: fullResponse}],
      _meta: {threadId: conversationId}
    };
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[MCP/chat] ❌ ERROR:', {
      message,
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString()
    });
    return {
      content: [{type: 'text', text: `Agent error: ${message}`}],
      isError: true
    };
  }
}
```

### Step 2: Check Backend Logs After Fix

After adding the logging above:

```bash
# Terminal 1: Start backend with debug output
cd /Users/nikhil/Desktop/GCFIS/apps/backend
npm run dev  # Or however the backend is started

# Terminal 2: Send test message
curl -X POST http://localhost:3011/api/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_AGENT_API_KEY" \
  -d '{"message": "Can you calculate 500 * 149 for me?"}'
```

Look for output like:
```
[MCP/chat] Starting - user message: Can you calculate 500 * 149 for me?
[MCP/chat] Resolving conversation...
[MCP/chat] Creating new conversation...
[MCP/chat] Conversation ID: abc123def456
[MCP/chat] Persisting user message...
[MCP/chat] Getting enabled skills...
[MCP/chat] Enabled skills: ['calculator', 'datetime', 'firecrawl', ...]
[MCP/chat] Building graph input...
[MCP/chat] Running graph...
[MCP/chat] 🔧 TOOL CALLED: {
  tool: 'calculator',
  input: { expression: '500 * 149' },
  timestamp: '2026-04-01T14:55:30.123Z'
}
[MCP/chat] Response generated
[MCP/chat] ✅ Success
```

---

## Solution B: Test Via Direct API (Quicker Verification)

If the MCP chat tool continues failing, bypass it entirely:

### Step 1: Use Backend Chat API Directly

```bash
# Test direct API endpoint instead of MCP
curl -X POST http://localhost:3011/api/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_AGENT_KEY" \
  -d '{
    "message": "We have 500 employees and 5M in revenue. What would PNPBrain cost us annually if we do 1000 messages per month?"
  }'
```

This tests the agent execution without the MCP layer that's currently failing.

### Step 2: Check for Tool-Calling Evidence

Look in the response for:
- Numerical calculations (calculator was used)
- Pricing recommendations
- Business context understanding (lead qualification attempted)

---

## Solution C: Enable Backend Tool Logging (Fastest Path)

Modify `packages/agent/src/graph.ts` to log all tool invocations:

```typescript
export async function* runGraph(input: GraphInput) {
  // ... existing code ...
  
  const stream = graph.streamEvents({ messages: promptMessages }, { version: 'v2' });
  for await (const event of stream) {
    // NEW: Log tool invocations
    if (event.event === 'on_tool_start') {
      console.log(`
╔════════════════════════════════════════════════════════╗
║ 🔧 TOOL INVOKED
║ Name: ${event.data.tool ?? 'UNKNOWN'}
║ Input: ${JSON.stringify(event.data.input ?? {})}
╚════════════════════════════════════════════════════════╝
      `);
    }
    
    if (event.event === 'on_tool_end') {
      console.log(`
╔════════════════════════════════════════════════════════╗
║ ✅ TOOL RESULT
║ Tool: ${event.data.tool ?? 'UNKNOWN'}
║ Output: ${typeof event.data.output === 'string' 
  ? event.data.output.substring(0, 100) 
  : JSON.stringify(event.data.output)}
╚════════════════════════════════════════════════════════╝
      `);
    }
    
    yield event;
  }
}
```

Then start the backend and watch the logs while sending messages:

```bash
# Terminal 1: Start with logging visible
pnpm dev
# Watch for tool invocation logs

# Terminal 2: Send a message that should trigger calculator
curl -X POST http://localhost:3011/api/chat \
  -H "x-api-key: YOUR_KEY" \
  -d '{"message": "What is 50 times 30?"}'
```

You'll see:
```
╔════════════════════════════════════════════════════════╗
║ 🔧 TOOL INVOKED
║ Name: calculator
║ Input: {"expression":"50 * 30"}
╚════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════╗
║ ✅ TOOL RESULT
║ Tool: calculator
║ Output: 50 * 30 = 1500
╚════════════════════════════════════════════════════════╝
```

---

## Step-by-Step Verification

### 1. Confirm Backend is Running

```bash
curl -s http://localhost:3011/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"ping"}'
```

Should return `{"error": "Missing x-api-key header"}` (not a network error).

### 2. Verify Agent Exists

```bash
curl -s http://localhost:3011/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_AGENT_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/list"}'
```

Should list all available tools including our 6 skills.

### 3. Test Basic Message (No Skills)

```bash
curl -s http://localhost:3011/api/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_AGENT_KEY" \
  -d '{"message": "What is PNPBrain?"}'
```

Should return agent response about PNPBrain.

### 4. Test Calculator Skill

```bash
curl -s http://localhost:3011/api/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_AGENT_KEY" \
  -d '{"message": "Can you calculate 25 times 40 plus 100?"}'
```

Monitor logs for tool invocation.

### 5. Test Lead Qualification Skill

```bash
curl -s http://localhost:3011/api/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_AGENT_KEY" \
  -d '{"message": "We are a 200-person SaaS company with $10M ARR. We need 24/7 support automation urgently. Timeline is maximum 30 days."}'
```

Monitor for lead_qualification tool invocation.

---

## Success Criteria

You'll know tools are working when:

✅ Backend logs show tool invocation with clear names  
✅ Calculator tool returns math results  
✅ Lead qualification scores leads (0-100)  
✅ DateTime handles timezone conversions  
✅ Firecrawl crawls URLs  
✅ Meeting Scheduler opens Calendly  
✅ Support Escalation creates Zendesk tickets  

---

## Quick Decision Tree

```
Q: Do you want to fix MCP chat?
├─→ YES: Follow Solution A (detailed)
│
└─→ NO: Use Solution C instead (logging-based)
    └─→ Add tool-logging to graph.ts
    └─→ Start backend with logs visible
    └─→ Send test messages via direct API
    └─→ Watch logs for tool invocation traces
```

---

## Summary

**You correctly identified** that we can't see tools being used in practice.

**The issue is** the agent execution is failing due to MCP interface problems.

**The fix is** to enable tool logging and test via the direct backend API instead of through the broken MCP layer.

**Within 30 minutes** you'll see clear evidence of tool-calling with detailed logging.

---

## Files to modify:

1. **apps/backend/src/mcp/server.ts** - Add console.log to `chat` tool
2. **packages/agent/src/graph.ts** - Add tool event logging to `runGraph`

## Next action:

Pick Solution A, B, or C above and start with Step 1.

Report back with the log output and we can verify tools are actually being invoked.
