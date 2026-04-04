'use client';

/**
 * PublicChat — full-page chat UI for a specific business.
 *
 * Receives the business config (fetched server-side in the page).
 * Sends messages to the backend streaming chat endpoint:
 *   POST /api/agent/chat  →  SSE stream of delta chunks
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { StreamEvent } from '@pnpbrain/types';
import { createChatClient } from '@pnpbrain/web-sdk';

const TOOL_LABELS: Record<string, string> = {
  calculator: 'doing a quick calculation',
  get_datetime: 'checking time and date details',
  firecrawl_scrape: 'looking up website information',
  qualify_lead: 'assessing your use case',
  route_qualified_lead: 'preparing handoff details',
  propose_meeting_slots: 'finding available meeting times',
  book_company_meeting: 'booking your meeting',
};

function normalizeTraceLine(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) return null;

  const lower = line.toLowerCase();
  if (lower.startsWith('step:') || lower.startsWith('running step:')) {
    if (lower.includes('retrieving_context')) return 'Looking up relevant information';
    if (lower.includes('decide')) return 'Planning the best response';
    if (lower.includes('channelwrite') || lower.includes('branch<') || lower.includes('branch:')) {
      return null;
    }
    return 'Working on your request';
  }

  if (lower.startsWith('using tool:')) {
    const toolName = line.slice('Using tool:'.length).trim();
    const friendly = TOOL_LABELS[toolName] ?? 'using a helper tool';
    return `I am ${friendly}`;
  }

  if (lower.startsWith('finished tool:')) {
    return 'Tool check complete';
  }

  if (lower.includes('result:')) {
    return 'Summarizing what I found';
  }

  return line;
}

interface BusinessConfig {
  id:             string;
  name:           string;
  slug:           string;
  agentId?:       string;
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

type ContentBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'unordered-list'; items: string[] };

function parseContentBlocks(content: string): ContentBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: ContentBlock[] = [];

  let paragraphLines: string[] = [];
  let listKind: 'ordered-list' | 'unordered-list' | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(' ').trim();
    if (text) {
      blocks.push({ kind: 'paragraph', text });
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listKind || listItems.length === 0) return;
    blocks.push({ kind: listKind, items: listItems });
    listKind = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const item = ordered[1];
      if (!item) continue;
      flushParagraph();
      if (listKind !== 'ordered-list') {
        flushList();
        listKind = 'ordered-list';
      }
      listItems.push(item);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      const item = unordered[1];
      if (!item) continue;
      flushParagraph();
      if (listKind !== 'unordered-list') {
        flushList();
        listKind = 'unordered-list';
      }
      listItems.push(item);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  if (blocks.length === 0 && content.trim()) {
    return [{ kind: 'paragraph', text: content.trim() }];
  }

  return blocks;
}

function renderInlineFormatting(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`bold-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <Fragment key={`text-${index}`}>{part}</Fragment>;
  });
}

function RichMessageContent({ content }: { content: string }) {
  const blocks = parseContentBlocks(content);

  return (
    <div className="space-y-2.5">
      {blocks.map((block, idx) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={`p-${idx}`} className="leading-relaxed">
              {renderInlineFormatting(block.text)}
            </p>
          );
        }

        if (block.kind === 'ordered-list') {
          return (
            <ol key={`ol-${idx}`} className="list-decimal space-y-1 pl-5 leading-relaxed">
              {block.items.map((item, itemIndex) => (
                <li key={`oli-${itemIndex}`}>{renderInlineFormatting(item)}</li>
              ))}
            </ol>
          );
        }

        return (
          <ul key={`ul-${idx}`} className="list-disc space-y-1 pl-5 leading-relaxed">
            {block.items.map((item, itemIndex) => (
              <li key={`uli-${itemIndex}`}>{renderInlineFormatting(item)}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

function getBackendUrl(): string {
  const envUrl = process.env['NEXT_PUBLIC_BACKEND_URL'];
  if (envUrl) return envUrl;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:3011`;
  }

  return process.env['NODE_ENV'] === 'development' ? 'http://localhost:3011' : '';
}

const STARTER_PROMPTS = [
  'What can you help me with?',
  'How does pricing work?',
  'Can I book a demo?',
];

export default function PublicChat({ config }: Props) {
  const isDark = config.widgetTheme === 'dark';
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [streaming,  setStreaming]  = useState(false);
  const [liveTrace,  setLiveTrace]  = useState<string[]>([]);
  const [transport,  setTransport]  = useState<'websocket' | 'sse' | null>(null);
  const [threadId,   setThreadId]   = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const lastTraceRef = useRef('');
  const chatClient = useMemo(
    () =>
      createChatClient({
        backendUrl: getBackendUrl(),
        publicToken: config.publicChatToken,
        ...(config.agentId ? { agentId: config.agentId } : {}),
      }),
    [config.publicChatToken, config.agentId]
  );

  const panelStyle = {
    '--brand': config.primaryColor,
    '--brand-soft': `${config.primaryColor}1f`,
    '--brand-mid': `${config.primaryColor}33`,
  } as React.CSSProperties;

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setStreaming(true);
    setLiveTrace([]);
    setTransport(null);

    // Append an empty assistant bubble that will be filled by the stream
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const appendTrace = (line: string) => {
      const normalized = normalizeTraceLine(line);
      if (!normalized) return;
      if (normalized === lastTraceRef.current) return;
      lastTraceRef.current = normalized;
      setLiveTrace((prev) => [...prev.slice(-7), normalized]);
    };

    const applyEvent = (event: StreamEvent) => {
      if (event.type === 'token') {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + event.token };
          }
          return next;
        });
        return;
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
        return;
      }

      if (event.type === 'thinking') {
        appendTrace(event.message);
        return;
      }

      if (event.type === 'reasoning') {
        appendTrace(event.summary);
        return;
      }

      if (event.type === 'step') {
        appendTrace(`Step: ${event.step}`);
      }
    };

    try {
      const result = await chatClient.sendMessage(
        {
          message: text.trim(),
          ...(threadId ? { threadId } : {}),
        },
        {
          onTransport: (nextTransport) => {
            setTransport(nextTransport);
            appendTrace(`Connected using ${nextTransport === 'websocket' ? 'WebSocket' : 'SSE'}`);
          },
          onEvent: (event) => {
            applyEvent(event);
          },
        }
      );

      if (result.threadId) {
        setThreadId(result.threadId);
      }
    } catch (err) {
      const fallback = 'Sorry, something went wrong. Please try again.';
      const message = err instanceof Error && err.message ? err.message : fallback;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          next[next.length - 1] = { ...last, content: message };
        }
        return next;
      });
      console.error('[PublicChat] stream error:', err);
      }
    finally {
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

  const bg = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const msgBg = isDark
    ? 'bg-slate-800 text-slate-100 border border-slate-700/80'
    : 'bg-white text-slate-800 shadow-sm border border-slate-200';
  const inputBg = isDark
    ? 'bg-slate-900/90 border-slate-700 text-slate-100 placeholder-slate-500'
    : 'bg-white/95 border-slate-300 text-slate-900 placeholder-slate-400';

  const hasConversation = messages.some((m) => m.role === 'user');

  return (
    <div
      className={`relative min-h-[100dvh] overflow-hidden px-2 py-2 sm:px-5 sm:py-5 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}
      style={panelStyle}
    >
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute -top-36 left-1/4 h-72 w-72 rounded-full blur-3xl" style={{ background: 'var(--brand-soft)' }} />
        <div className="absolute -bottom-24 right-8 h-72 w-72 rounded-full blur-3xl" style={{ background: 'var(--brand-mid)' }} />
      </div>

      <main className="relative mx-auto grid h-[calc(100dvh-1rem)] w-full max-w-7xl overflow-hidden rounded-[28px] border border-slate-300/60 bg-white/85 shadow-[0_24px_90px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:h-[calc(100dvh-2.5rem)] lg:grid-cols-[320px_1fr] dark:border-slate-700/70 dark:bg-slate-900/80">
        <aside className="hidden border-r border-slate-200/80 p-5 lg:flex lg:flex-col lg:gap-5 dark:border-slate-700/70">
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/65">
            <div className="flex items-center gap-3">
              {config.showAvatar && (
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg" style={{ background: 'var(--brand-soft)' }}>
                  🤖
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500" style={{ fontFamily: 'var(--font-manrope)' }}>assistant</p>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {config.botName}
                </h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300" style={{ fontFamily: 'var(--font-manrope)' }}>
              Fast, context-aware support for {config.name}. Ask product, pricing, or setup questions.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/65">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500" style={{ fontFamily: 'var(--font-manrope)' }}>quick prompts</p>
            <div className="mt-3 flex flex-col gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={streaming}
                  className="rounded-xl border border-slate-300/90 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200" style={{ fontFamily: 'var(--font-manrope)' }}>
            Live chat is active
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <header className="border-b border-slate-200/80 px-4 py-4 sm:px-6 dark:border-slate-700/70">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-[0.18em] text-slate-500" style={{ fontFamily: 'var(--font-manrope)' }}>
                  {config.name}
                </p>
                <h1 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Chat with {config.botName || 'Assistant'}
                </h1>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                live chat
              </span>
            </div>
          </header>

          <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 ${bg}`}>
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {!hasConversation && (
                <div className="mb-2 rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    Start with one of these
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={`inline-${prompt}`}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        disabled={streaming}
                        className="rounded-full border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200"
                        style={{ fontFamily: 'var(--font-manrope)' }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {liveTrace.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-300">
                  <p className="mb-1 font-semibold uppercase tracking-wide">Live reasoning ({transport ?? 'stream'})</p>
                  {liveTrace.map((line, idx) => (
                    <p key={`${line}-${idx}`} className="truncate">{line}</p>
                  ))}
                </div>
              )}

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

              {streaming && messages[messages.length - 1]?.content === '' && (
                <TypingIndicator isDark={isDark} showAvatar={config.showAvatar} primaryColor={config.primaryColor} />
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-slate-200/80 bg-white/85 p-3 sm:p-4 dark:border-slate-700/70 dark:bg-slate-900/75">
            <div className="mx-auto flex w-full max-w-4xl items-end gap-3">
              <div className="flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={streaming}
                  placeholder={streaming ? 'Waiting for response...' : 'Ask about product, pricing, setup, or support'}
                  className={`h-12 w-full rounded-2xl border px-4 text-sm focus:outline-none focus:ring-2 transition ${inputBg}`}
                  style={{ '--tw-ring-color': `${config.primaryColor}66`, fontFamily: 'var(--font-manrope)' } as React.CSSProperties}
                />
              </div>
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={streaming || !input.trim()}
                className="h-12 rounded-2xl px-5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: config.primaryColor, fontFamily: 'var(--font-space-grotesk)' }}
                aria-label="Send"
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </main>
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
            className="max-w-[82%] rounded-2xl rounded-br-sm px-4 py-3 text-sm text-white whitespace-pre-wrap break-words sm:max-w-[70%]"
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
      <div className={`max-w-[82%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm break-words sm:max-w-[70%] ${msgBg}`}>
        {message.content ? <RichMessageContent content={message.content} /> : <span className="opacity-0">…</span>}
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
