# Frontend Integration Guide

This guide shows how to connect any frontend to PNpbrain while keeping the same backend agent logic.

For a broader plug-and-play matrix that includes messaging channels and backend languages, see [PLUG_AND_PLAY_SOLUTIONS.md](PLUG_AND_PLAY_SOLUTIONS.md).

## Supported Transports

- WebSocket endpoint: /ws/agent
- SSE endpoint: POST /api/agent/chat
- Shared browser SDK: @pnpbrain/web-sdk (auto WebSocket fallback to SSE)

## Quick Decision Guide

- Use the widget or hosted chat page when you want the fastest launch.
- Use the browser SDK when you need a custom frontend.
- Use the SSE endpoint when your network blocks WebSockets.
- Use the WebSocket endpoint when you need lower latency or live typing feedback.
- Use `x-api-key` only from trusted server-side code.

## Auth Models

- Public frontend traffic: publicToken
- Privileged server traffic: x-api-key

## Quick Start (Browser SDK)

Install:

- pnpm add @pnpbrain/web-sdk

Create client:

```ts
import { createChatClient } from '@pnpbrain/web-sdk';

const chatClient = createChatClient({
  backendUrl: 'https://api.your-domain.com',
  publicToken: 'PUBLIC_CHAT_TOKEN',
  // optional agentId when you need explicit agent selection
  // agentId: 'agent-uuid'
});
```

Send message:

```ts
let threadId: string | undefined;

const result = await chatClient.sendMessage(
  {
    message: 'What can you help me with?',
    threadId,
  },
  {
    onTransport: (transport) => {
      console.log('transport:', transport);
    },
    onEvent: (event) => {
      if (event.type === 'token') {
        // append token to assistant bubble
      }

      if (event.type === 'done') {
        threadId = event.threadId;
      }
    },
  }
);

threadId = result.threadId ?? threadId;
```

## React Pattern

```ts
const [threadId, setThreadId] = useState<string | undefined>(undefined);
const [assistant, setAssistant] = useState('');

async function handleSend(message: string) {
  setAssistant('');

  const result = await chatClient.sendMessage(
    { message, threadId },
    {
      onEvent: (event) => {
        if (event.type === 'token') {
          setAssistant((prev) => prev + event.token);
        }

        if (event.type === 'done') {
          setThreadId(event.threadId);
          setAssistant(event.message.content);
        }
      },
    }
  );

  if (result.threadId) setThreadId(result.threadId);
}
```

## Vue Pattern

```ts
const threadId = ref<string | undefined>();
const assistant = ref('');

async function send(message: string) {
  assistant.value = '';

  const result = await chatClient.sendMessage(
    { message, threadId: threadId.value },
    {
      onEvent: (event) => {
        if (event.type === 'token') assistant.value += event.token;
        if (event.type === 'done') {
          threadId.value = event.threadId;
          assistant.value = event.message.content;
        }
      },
    }
  );

  threadId.value = result.threadId ?? threadId.value;
}
```

## Svelte Pattern

```ts
let threadId: string | undefined;
let assistant = '';

async function send(message: string) {
  assistant = '';

  const result = await chatClient.sendMessage(
    { message, threadId },
    {
      onEvent: (event) => {
        if (event.type === 'token') assistant += event.token;
        if (event.type === 'done') {
          threadId = event.threadId;
          assistant = event.message.content;
        }
      },
    }
  );

  threadId = result.threadId ?? threadId;
}
```

## Plain JavaScript (No Framework)

```js
import { createChatClient } from '@pnpbrain/web-sdk';

const client = createChatClient({
  backendUrl: 'https://api.your-domain.com',
  publicToken: 'PUBLIC_CHAT_TOKEN',
});

let threadId;

async function send(message) {
  let assistant = '';

  const result = await client.sendMessage(
    { message, threadId },
    {
      onEvent: (event) => {
        if (event.type === 'token') {
          assistant += event.token;
        }

        if (event.type === 'done') {
          threadId = event.threadId;
          assistant = event.message.content;
        }
      },
    }
  );

  threadId = result.threadId || threadId;
  return assistant;
}
```

## Fallback Behavior

The SDK automatically:

1. Tries WebSocket first.
2. Falls back to SSE if WebSocket fails.
3. Preserves the same event model and thread continuity.

## Event Types

- step
- token
- thinking
- reasoning
- done
- error

## Security Notes

- Never expose x-api-key in browser code.
- Use publicToken for browser clients.
- Keep domain allowlists configured for public traffic.

## Operational Notes

- Track transport usage to detect network environments where WebSocket is blocked.
- Monitor fallback rate and connection errors.
- Keep one persistent threadId per user session for better continuity.
