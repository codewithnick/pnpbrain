import type { StreamEvent } from '@gcfis/types';

export type ChatTransport = 'websocket' | 'sse';

export interface ChatClientConfig {
  backendUrl: string;
  publicToken: string;
  agentId?: string;
}

export interface ChatSendRequest {
  message: string;
  threadId?: string;
}

export interface ChatSendHandlers {
  onEvent?: (event: StreamEvent) => void;
  onTransport?: (transport: ChatTransport) => void;
}

export interface ChatSendResult {
  threadId?: string;
  transport: ChatTransport;
}

function toWsUrl(backendUrl: string): string | null {
  try {
    const parsed = new URL(backendUrl);
    if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
    else if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
    else if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return null;
    parsed.pathname = '/ws/agent';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

async function runWebSocket(
  wsUrl: string,
  payload: Record<string, unknown>,
  handlers: ChatSendHandlers
): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve, reject) => {
    let finished = false;
    let resolvedThreadId: string | undefined;
    const ws = new WebSocket(wsUrl);
    const connectTimer = globalThis.setTimeout(() => {
      if (!finished) {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }
    }, 10000);

    ws.onopen = () => {
      globalThis.clearTimeout(connectTimer);
      handlers.onTransport?.('websocket');
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (messageEvent) => {
      try {
        const event = JSON.parse(String(messageEvent.data)) as StreamEvent;
        handlers.onEvent?.(event);

        if (event.type === 'error') {
          finished = true;
          globalThis.clearTimeout(connectTimer);
          ws.close();
          reject(new Error(event.error));
          return;
        }

        if (event.type === 'done') {
          resolvedThreadId = event.threadId;
          finished = true;
          globalThis.clearTimeout(connectTimer);
          ws.close();
          resolve(resolvedThreadId);
        }
      } catch (err) {
        if (!finished) {
          finished = true;
          globalThis.clearTimeout(connectTimer);
          ws.close();
          reject(err instanceof Error ? err : new Error('Failed to parse WebSocket event'));
        }
      }
    };

    ws.onerror = () => {
      if (!finished) {
        finished = true;
        globalThis.clearTimeout(connectTimer);
        reject(new Error('WebSocket transport unavailable'));
      }
    };

    ws.onclose = () => {
      if (!finished) {
        finished = true;
        globalThis.clearTimeout(connectTimer);
        reject(new Error('WebSocket connection closed unexpectedly'));
      }
    };
  });
}

async function runSse(
  backendUrl: string,
  payload: Record<string, unknown>,
  handlers: ChatSendHandlers
): Promise<string | undefined> {
  const response = await fetch(`${backendUrl}/api/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => 'Failed to connect using SSE transport');
    throw new Error(detail || 'Failed to connect using SSE transport');
  }

  handlers.onTransport?.('sse');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneThreadId: string | undefined;
  let completed = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const rawLine of rawEvent.split('\n')) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;

        const payloadText = line.slice(5).trim();
        if (!payloadText) continue;

        const event = JSON.parse(payloadText) as StreamEvent;
        handlers.onEvent?.(event);

        if (event.type === 'error') {
          throw new Error(event.error);
        }

        if (event.type === 'done') {
          doneThreadId = event.threadId;
          completed = true;
        }
      }

      if (completed) return doneThreadId;
      boundary = buffer.indexOf('\n\n');
    }
  }

  if (!completed) {
    throw new Error('SSE stream ended before completion');
  }

  return doneThreadId;
}

export function createChatClient(config: ChatClientConfig) {
  return {
    async sendMessage(request: ChatSendRequest, handlers: ChatSendHandlers = {}): Promise<ChatSendResult> {
      const message = request.message.trim();
      if (!message) {
        throw new Error('message is required');
      }

      const payload: Record<string, unknown> = {
        type: 'chat',
        message,
        publicToken: config.publicToken,
        ...(config.agentId ? { agentId: config.agentId } : {}),
        ...(request.threadId ? { threadId: request.threadId } : {}),
      };

      const wsUrl = toWsUrl(config.backendUrl);
      if (wsUrl) {
        try {
          const threadId = await runWebSocket(wsUrl, payload, handlers);
          return threadId
            ? { threadId, transport: 'websocket' }
            : { transport: 'websocket' };
        } catch {
          const threadId = await runSse(config.backendUrl, payload, handlers);
          return threadId
            ? { threadId, transport: 'sse' }
            : { transport: 'sse' };
        }
      }

      const threadId = await runSse(config.backendUrl, payload, handlers);
      return threadId
        ? { threadId, transport: 'sse' }
        : { transport: 'sse' };
    },
  };
}
