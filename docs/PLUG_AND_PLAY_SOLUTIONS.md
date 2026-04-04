# Plug-and-Play Solutions Guide

PNPBrain is designed to be embedded once and reused everywhere: websites, apps, chat platforms, and backend workflows. The same agent, thread continuity, and auth model should work across every surface.

## What You Can Connect

### Frontend Surfaces

- Plain HTML and static sites
- React and Next.js
- Vue and Nuxt
- Svelte and SvelteKit
- Angular
- WordPress and PHP sites
- Mobile web apps
- Native mobile apps that call the HTTP API or WebSocket endpoint

### Messaging and Community Channels

- Telegram bots
- WhatsApp Business
- Slack apps
- Discord bots
- Microsoft Teams bots
- SMS via Twilio or a similar gateway
- Email inboxes and outbound reply flows

### Server and Automation Languages

- JavaScript and TypeScript
- Python
- Go
- Java and Kotlin
- C# and .NET
- PHP
- Ruby

## Universal Setup

1. Create an agent in the admin dashboard.
2. Generate a public token for browser or channel traffic.
3. Use `x-api-key` only from trusted server-side code.
4. Choose one transport: WebSocket for low latency, SSE for broad compatibility, or plain webhook forwarding for chat platforms.
5. Persist `threadId` per user so the conversation continues across sessions and channels.

## Browser and Frontend Setup

### 1) Script Tag

Use this when you want the fastest possible install on any website.

```html
<script src="https://pnpbrain.com/embed.js" data-agent-id="YOUR_AGENT_ID"></script>
```

### 2) Browser SDK

Use this for custom UIs, single-page apps, and dashboards.

```ts
import { createChatClient } from '@pnpbrain/web-sdk';

const client = createChatClient({
  backendUrl: 'https://api.your-domain.com',
  publicToken: 'PUBLIC_CHAT_TOKEN',
  agentId: 'YOUR_AGENT_ID',
});
```

### 3) React / Next.js

```tsx
const result = await client.sendMessage(
  { message, threadId },
  {
    onEvent: (event) => {
      if (event.type === 'token') {
        setAssistant((prev) => prev + event.token);
      }

      if (event.type === 'done') {
        setThreadId(event.threadId);
      }
    },
  }
);
```

### 4) Vue / Nuxt

```ts
const result = await client.sendMessage({ message, threadId }, { onEvent });
```

### 5) Svelte / SvelteKit

```ts
const result = await client.sendMessage({ message, threadId }, { onEvent });
```

### 6) Angular

```ts
this.client.sendMessage({ message, threadId }, { onEvent }).then((result) => {
  this.threadId = result.threadId ?? this.threadId;
});
```

## Server-Side Setup by Language

The request shape is the same everywhere:

```json
{
  "message": "What can you help me with?",
  "threadId": "optional-thread-id"
}
```

### JavaScript / TypeScript

```ts
await fetch('https://api.your-domain.com/api/agent/chat', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': process.env['API_KEY'] ?? '',
  },
  body: JSON.stringify({ message, threadId }),
});
```

### Python

```py
import os
import requests

response = requests.post(
    'https://api.your-domain.com/api/agent/chat',
    headers={
        'content-type': 'application/json',
        'x-api-key': os.environ['API_KEY'],
    },
    json={'message': message, 'threadId': thread_id},
)
```

### Go

```go
reqBody := strings.NewReader(`{"message":"Hello","threadId":""}`)
req, _ := http.NewRequest(http.MethodPost, "https://api.your-domain.com/api/agent/chat", reqBody)
req.Header.Set("content-type", "application/json")
req.Header.Set("x-api-key", os.Getenv("API_KEY"))
```

### Java / Kotlin

```java
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.your-domain.com/api/agent/chat"))
    .header("content-type", "application/json")
    .header("x-api-key", System.getenv("API_KEY"))
    .POST(HttpRequest.BodyPublishers.ofString(payload))
    .build();
```

### C# / .NET

```csharp
var request = new HttpRequestMessage(HttpMethod.Post, "https://api.your-domain.com/api/agent/chat");
request.Headers.Add("x-api-key", Environment.GetEnvironmentVariable("API_KEY"));
request.Content = JsonContent.Create(new { message, threadId });
```

### PHP

```php
$payload = json_encode(['message' => $message, 'threadId' => $threadId]);
```

### Ruby

```rb
uri = URI('https://api.your-domain.com/api/agent/chat')
request = Net::HTTP::Post.new(uri)
request['content-type'] = 'application/json'
request['x-api-key'] = ENV['API_KEY']
request.body = { message: message, threadId: thread_id }.to_json
```

## Channel Bot Setup

### Telegram

1. Create a Telegram bot with BotFather.
2. Configure a webhook that receives incoming messages.
3. Forward each update to your agent backend.
4. Reply back to Telegram with the assistant message.

Recommended mapping:

- Telegram `chat.id` -> store as the conversation key
- Telegram `message.text` -> send as `message`
- Telegram `message.from.id` -> optional user key for analytics

### WhatsApp

1. Enable WhatsApp Business API or a provider such as Twilio.
2. Configure inbound message webhooks.
3. Pass inbound text to the agent backend.
4. Send the streamed or final response back through the provider API.

### Slack

1. Create a Slack app.
2. Enable Events API or Slash Commands.
3. Send incoming messages to your agent backend.
4. Post the reply using the Slack chat API.

### Discord

1. Create a Discord application and bot.
2. Listen for interactions or message events.
3. Forward the content to the agent backend.
4. Send the response back to the channel or thread.

### Microsoft Teams

1. Register a Teams bot in Azure.
2. Accept incoming activity payloads.
3. Map message content to the agent backend.
4. Respond using the Teams bot framework.

## Best Practices

- Keep `x-api-key` on the server only.
- Use `publicToken` for browser and public chat traffic.
- Store one `threadId` per user, bot, or channel conversation.
- Normalize channel-specific metadata before sending it to the agent.
- Prefer a single backend contract so every language and channel uses the same behavior.

## Recommended Delivery Model

1. Start with the website widget or hosted chat page.
2. Add the browser SDK for custom frontend work.
3. Expose a server-side API wrapper for backend languages.
4. Attach messaging channels like Telegram, WhatsApp, Slack, and Discord through webhooks.
5. Reuse the same agent, same memory, and same toolchain everywhere.