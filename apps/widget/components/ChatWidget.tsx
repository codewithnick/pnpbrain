'use client';

/**
 * ChatWidget — the core embeddable chat component.
 *
 * Self-contained: no shared UI library, imports only from @gcfis/types.
 * Communicates with the PNPBrain backend via streaming SSE fetch.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { WidgetConfig, StreamEvent } from '@gcfis/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatWidgetProps {
  config: WidgetConfig;
}

export default function ChatWidget({ config }: ChatWidgetProps) {
  const {
    publicToken,
    backendUrl,
    botName = 'Assistant',
    primaryColor = '#6366f1',
    placeholder = 'Type a message…',
    welcomeMessage = 'Hi! How can I help you today?',
  } = config;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: welcomeMessage },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || thinking) return;

      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setThinking(true);

      // Streaming assistant message placeholder
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      try {
        const res = await fetch(`${backendUrl}/api/agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, publicToken, threadId }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Backend returned ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6);
            if (json === '[DONE]') continue;

            try {
              const event = JSON.parse(json) as StreamEvent;

              if (event.type === 'token') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + event.token } : m
                  )
                );
              } else if (event.type === 'done') {
                setThreadId(event.threadId);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, id: event.message.id, content: event.message.content }
                      : m
                  )
                );
              } else if (event.type === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: `Sorry, something went wrong: ${event.error}` }
                      : m
                  )
                );
              }
            } catch {
              // Ignore parse errors on individual SSE frames
            }
          }
        }
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Sorry, I couldn't connect to the server. (${errorText})` }
              : m
          )
        );
      } finally {
        setThinking(false);
      }
    },
    [backendUrl, publicToken, threadId, thinking]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          style={{ backgroundColor: primaryColor }}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full text-white shadow-lg flex items-center justify-center text-2xl hover:opacity-90 transition-opacity z-50"
        >
          💬
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-6 right-6 w-[360px] h-[540px] rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 bg-white border border-gray-200">
          {/* Header */}
          <div
            style={{ backgroundColor: primaryColor }}
            className="flex items-center justify-between px-4 py-3 text-white"
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                {botName[0]}
              </div>
              <div>
                <p className="text-sm font-semibold">{botName}</p>
                <p className="text-xs opacity-70">Online</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-white/70 hover:text-white transition-colors text-lg"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  style={msg.role === 'user' ? { backgroundColor: primaryColor } : {}}
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'text-white'
                      : 'bg-white border border-gray-100 text-gray-800 shadow-sm'
                  }`}
                >
                  {msg.content || (
                    <span className="inline-flex gap-1 text-gray-400">
                      <span className="animate-bounce">·</span>
                      <span className="animate-bounce [animation-delay:0.1s]">·</span>
                      <span className="animate-bounce [animation-delay:0.2s]">·</span>
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {thinking && messages.at(-1)?.content === '' ? null : thinking ? (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl px-3 py-2 text-sm text-gray-400 shadow-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce [animation-delay:0.1s]">·</span>
                    <span className="animate-bounce [animation-delay:0.2s]">·</span>
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 bg-white px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={thinking}
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-300 disabled:opacity-60 max-h-28 overflow-y-auto"
                style={{ lineHeight: '1.5' }}
              />
              <button
                onClick={() => void sendMessage(input)}
                disabled={!input.trim() || thinking}
                style={{ backgroundColor: primaryColor }}
                className="h-9 w-9 rounded-lg flex items-center justify-center text-white disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-300 mt-2">Powered by PNPBrain</p>
          </div>
        </div>
      )}
    </>
  );
}
