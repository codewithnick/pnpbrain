'use client';

/**
 * ChatWidget — the core embeddable chat component.
 *
 * Self-contained: no shared UI library, imports only from @pnpbrain/types.
 * Communicates with the PNPBrain backend via streaming SSE fetch.
 */

import { Fragment, memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { WidgetConfig, StreamEvent } from '@pnpbrain/types';
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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatWidgetProps {
  config: WidgetConfig;
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

const RichMessageContent = memo(function RichMessageContent({
  content,
}: Readonly<{ content: string }>) {
  const blocks = parseContentBlocks(content);

  return (
    <div className="space-y-2">
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
});

export default function ChatWidget({ config }: Readonly<ChatWidgetProps>) {
  const {
    publicToken,
    agentId,
    backendUrl,
    botName = 'Assistant',
    primaryColor = '#6366f1',
    placeholder = 'Type a message…',
    welcomeMessage = 'Hi! How can I help you today?',
    assistantAvatarMode = 'initial',
    assistantAvatarText,
    assistantAvatarImageUrl,
    showAssistantAvatar = true,
    showUserAvatar = false,
    userAvatarText = 'You',
    position = 'bottom-right',
    headerSubtitle = 'Online',
    chatBackgroundColor = '#f9fafb',
    userMessageColor,
    assistantMessageColor = '#ffffff',
    borderRadiusPx = 16,
    showPoweredBy = true,
  } = config;

  const panelRadius = Math.max(8, Math.min(borderRadiusPx, 32));
  const floatingPositionClass = position === 'bottom-left' ? 'left-6' : 'right-6';
  const resolvedUserMessageColor = userMessageColor ?? primaryColor;
  const resolvedAssistantAvatarText =
    (assistantAvatarText?.trim() || botName.trim().charAt(0) || 'A').slice(0, 2);
  const resolvedUserAvatarText = (userAvatarText.trim() || 'You').slice(0, 2);

  const renderAssistantAvatar = (sizeClass = 'h-8 w-8') => {
    if (!showAssistantAvatar) return null;

    if (assistantAvatarMode === 'image' && assistantAvatarImageUrl) {
      return (
        <img
          src={assistantAvatarImageUrl}
          alt={`${botName} avatar`}
          className={`${sizeClass} rounded-full object-cover border border-white/30`}
        />
      );
    }

    return (
      <div
        className={`${sizeClass} rounded-full bg-white/20 flex items-center justify-center font-bold text-sm`}
      >
        {resolvedAssistantAvatarText}
      </div>
    );
  };

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: welcomeMessage },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [liveTrace, setLiveTrace] = useState<string[]>([]);
  const [transport, setTransport] = useState<'websocket' | 'sse' | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTraceRef = useRef('');
  const tokenBufferRef = useRef('');
  const tokenFlushTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const chatClient = useMemo(
    () =>
      createChatClient({
        backendUrl,
        publicToken,
        ...(agentId ? { agentId } : {}),
      }),
    [backendUrl, publicToken, agentId]
  );

  const appendTrace = useCallback((line: string) => {
    const normalized = normalizeTraceLine(line);
    if (!normalized) return;
    if (normalized === lastTraceRef.current) return;
    lastTraceRef.current = normalized;
    setLiveTrace((prev) => [...prev.slice(-5), normalized]);
  }, []);

  const updateAssistantMessage = useCallback(
    (
      assistantId: string,
      updater: (message: Message) => Message
    ) => {
      setMessages((prev) => prev.map((message) => (message.id === assistantId ? updater(message) : message)));
    },
    []
  );

  const flushAssistantTokens = useCallback(
    (assistantId: string) => {
      if (tokenFlushTimerRef.current !== null) {
        globalThis.clearTimeout(tokenFlushTimerRef.current);
        tokenFlushTimerRef.current = null;
      }

      const buffered = tokenBufferRef.current;
      if (!buffered) return;

      tokenBufferRef.current = '';
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        content: message.content + buffered,
      }));
    },
    [updateAssistantMessage]
  );

  const queueAssistantToken = useCallback(
    (assistantId: string, token: string) => {
      tokenBufferRef.current += token;
      if (tokenFlushTimerRef.current !== null) return;

      tokenFlushTimerRef.current = globalThis.setTimeout(() => {
        flushAssistantTokens(assistantId);
      }, 60);
    },
    [flushAssistantTokens]
  );

  useEffect(() => {
    return () => {
      if (tokenFlushTimerRef.current !== null) {
        globalThis.clearTimeout(tokenFlushTimerRef.current);
      }
    };
  }, []);

  // Auto-scroll to the bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || thinking) return;

      tokenBufferRef.current = '';
      if (tokenFlushTimerRef.current !== null) {
        globalThis.clearTimeout(tokenFlushTimerRef.current);
        tokenFlushTimerRef.current = null;
      }

      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setThinking(true);
      setLiveTrace([]);
      setTransport(null);

      // Streaming assistant message placeholder
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      const applyEvent = (event: StreamEvent) => {
        if (event.type === 'token') {
          queueAssistantToken(assistantId, event.token);
          return;
        }

        if (event.type === 'done') {
          flushAssistantTokens(assistantId);
          setThreadId(event.threadId);
          updateAssistantMessage(assistantId, (message) => ({
            ...message,
            id: event.message.id,
            content: event.message.content,
          }));
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
          return;
        }

        if (event.type === 'error') {
          flushAssistantTokens(assistantId);
          updateAssistantMessage(assistantId, (message) => ({
            ...message,
            content: `Sorry, something went wrong: ${event.error}`,
          }));
        }
      };

      try {
        const result = await chatClient.sendMessage(
          {
            message: text,
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
        flushAssistantTokens(assistantId);
        const errorText = err instanceof Error ? err.message : String(err);
        updateAssistantMessage(assistantId, (message) => ({
          ...message,
          content: `Sorry, I couldn't connect to the server. (${errorText})`,
        }));
      } finally {
        setThinking(false);
      }
    },
    [chatClient, threadId, thinking, appendTrace, flushAssistantTokens, queueAssistantToken, updateAssistantMessage]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const showThinkingBubble = thinking && messages.at(-1)?.content !== '';

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          style={{ backgroundColor: primaryColor }}
          className={`fixed bottom-6 ${floatingPositionClass} h-14 w-14 rounded-full text-white shadow-lg flex items-center justify-center text-2xl hover:opacity-90 transition-opacity z-50`}
        >
          💬
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div
          className={`fixed bottom-6 ${floatingPositionClass} w-[360px] h-[540px] shadow-2xl flex flex-col overflow-hidden z-50 bg-white border border-gray-200`}
          style={{ borderRadius: panelRadius }}
        >
          {/* Header */}
          <div
            style={{ backgroundColor: primaryColor }}
            className="flex items-center justify-between px-4 py-3 text-white"
          >
            <div className="flex items-center gap-2">
              {renderAssistantAvatar()}
              <div>
                <p className="text-sm font-semibold">{botName}</p>
                <p className="text-xs opacity-70">{headerSubtitle}</p>
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
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: chatBackgroundColor }}>
            {liveTrace.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm">
                <p className="mb-1 font-semibold text-gray-700">Live reasoning ({transport ?? 'stream'})</p>
                {liveTrace.map((line, idx) => (
                  <p key={`${line}-${idx}`} className="truncate">{line}</p>
                ))}
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex items-end gap-2 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && showAssistantAvatar ? (
                    <div className="shrink-0">{renderAssistantAvatar('h-7 w-7')}</div>
                  ) : null}
                  {msg.role === 'user' && showUserAvatar ? (
                    <div className="h-7 w-7 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {resolvedUserAvatarText}
                    </div>
                  ) : null}

                  <div
                    style={
                      msg.role === 'user'
                        ? { backgroundColor: resolvedUserMessageColor }
                        : { backgroundColor: assistantMessageColor }
                    }
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'text-white'
                        : 'border border-gray-100 text-gray-800 shadow-sm'
                    }`}
                  >
                    {msg.content ? (
                      msg.role === 'assistant' ? <RichMessageContent content={msg.content} /> : <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : (
                      <span className="inline-flex gap-1 text-gray-400">
                        <span className="animate-bounce">·</span>
                        <span className="animate-bounce [animation-delay:0.1s]">·</span>
                        <span className="animate-bounce [animation-delay:0.2s]">·</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {showThinkingBubble ? (
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
            <p className="mt-2 text-center text-[10px] text-gray-400">
              Conversation history is saved so you can revisit it later.
            </p>
            {showPoweredBy ? (
              <p className="text-center text-[10px] text-gray-300 mt-2">Powered by PNPBrain</p>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
