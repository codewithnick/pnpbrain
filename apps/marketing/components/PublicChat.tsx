'use client';

/**
 * PublicChat — full-page chat UI for a specific business.
 *
 * Receives the business config (fetched server-side in the page).
 * Sends messages to the backend streaming chat endpoint:
 *   POST /api/agent/chat  →  SSE stream of delta chunks
 */

import { useEffect, useRef, useState } from 'react';
import type { StreamEvent } from '@gcfis/types';

interface BusinessConfig {
  name:           string;
  slug:           string;
  botName:        string;
  welcomeMessage: string;
  primaryColor:   string;
  widgetTheme:    'light' | 'dark' | string;
  showAvatar:     boolean;
  publicChatToken: string;
}

interface Message {
  role:    'user' | 'assistant';
  content: string;
}

interface Props {
  config: BusinessConfig;
}

const BACKEND_URL =
  process.env['NEXT_PUBLIC_BACKEND_URL'] ?? '';

export default function PublicChat({ config }: Props) {
  const isDark = config.widgetTheme === 'dark';
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [streaming,  setStreaming]  = useState(false);
  const [threadId,   setThreadId]   = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Show welcome message as the first bot bubble
  useEffect(() => {
    if (config.welcomeMessage) {
      setMessages([{ role: 'assistant', content: config.welcomeMessage }]);
    }
  }, [config.welcomeMessage]);

  // Auto-scroll on every new message / chunk
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setStreaming(true);

    // Append an empty assistant bubble that will be filled by the stream
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          publicToken: config.publicChatToken,
          ...(threadId ? { threadId } : {}),
        }),
      });

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;

          try {
            const event = JSON.parse(payload) as StreamEvent;

            if (event.type === 'token') {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + event.token };
                }
                return next;
              });
              continue;
            }

            if (event.type === 'done') {
              setThreadId(event.threadId);
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: event.message.content };
                }
                return next;
              });
              continue;
            }

            if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch {
            // ignore malformed SSE frames
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          next[next.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.' };
        }
        return next;
      });
      console.error('[PublicChat] stream error:', err);
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const bg      = isDark ? 'bg-gray-900'   : 'bg-gray-50';
  const msgBg   = isDark ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-800 shadow-sm border border-gray-100';
  const inputBg = isDark ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header
        className="shrink-0 flex items-center gap-3 px-5 py-4 shadow-md"
        style={{ background: config.primaryColor }}
      >
        {config.showAvatar && (
          <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-white text-base shrink-0 select-none">
            🤖
          </div>
        )}
        <div>
          <h1 className="text-white font-semibold text-base leading-tight">{config.botName || 'Assistant'}</h1>
          <p className="text-white/70 text-xs">{config.name}</p>
        </div>
      </header>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto px-4 py-5 space-y-4 ${bg}`}>
        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            message={msg}
            isDark={isDark}
            primaryColor={config.primaryColor}
            showAvatar={config.showAvatar}
            msgBg={msgBg}
          />
        ))}

        {/* Typing indicator */}
        {streaming && messages[messages.length - 1]?.content === '' && (
          <TypingIndicator isDark={isDark} showAvatar={config.showAvatar} primaryColor={config.primaryColor} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className={`shrink-0 flex items-center gap-3 px-4 py-3 border-t ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder={streaming ? 'Waiting for response…' : 'Type a message…'}
          className={`flex-1 rounded-full border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${inputBg}`}
          style={{ '--tw-ring-color': config.primaryColor + '55' } as React.CSSProperties}
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={streaming || !input.trim()}
          className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white text-base disabled:opacity-40 transition"
          style={{ background: config.primaryColor }}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function ChatBubble({
  message,
  isDark,
  primaryColor,
  showAvatar,
  msgBg,
}: {
  message: Message;
  isDark: boolean;
  primaryColor: string;
  showAvatar: boolean;
  msgBg: string;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[75%] sm:max-w-[60%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-white whitespace-pre-wrap break-words"
          style={{ background: primaryColor }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      {showAvatar && (
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-sm shrink-0 select-none"
          style={{ background: primaryColor + '33' }}
        >
          🤖
        </div>
      )}
      <div className={`max-w-[75%] sm:max-w-[60%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm ${msgBg} whitespace-pre-wrap break-words`}>
        {message.content || <span className="opacity-0">…</span>}
      </div>
    </div>
  );
}

function TypingIndicator({
  isDark,
  showAvatar,
  primaryColor,
}: {
  isDark: boolean;
  showAvatar: boolean;
  primaryColor: string;
}) {
  return (
    <div className="flex items-end gap-2">
      {showAvatar && (
        <div className="h-7 w-7 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: primaryColor + '33' }}>
          🤖
        </div>
      )}
      <div className={`rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 ${isDark ? 'bg-gray-700' : 'bg-white shadow-sm border border-gray-100'}`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
