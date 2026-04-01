/**
 * REST API request/response shapes — shared between backend, widget, and admin.
 */

import type { ChatMessage } from './agent.js';

// ─── /api/agent/chat ──────────────────────────────────────────────────────────

export interface ChatRequest {
  /** The message from the end-user */
  message: string;
  /** Conversation thread ID — omit to start a new conversation */
  threadId?: string;
  /** Business / installation ID so the backend loads the right knowledge base */
  businessId: string;
}

export interface ChatResponse {
  threadId: string;
  message: ChatMessage;
}

/** SSE streaming event emitted by the backend during generation */
export type StreamEvent =
  | { type: 'step'; step: string }
  | { type: 'token'; token: string }
  | { type: 'done'; threadId: string; message: ChatMessage }
  | { type: 'error'; error: string };

// ─── /api/knowledge/* ────────────────────────────────────────────────────────

export interface KnowledgeDocument {
  id: string;
  businessId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  /** ISO-8601 */
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeRequest {
  businessId: string;
  title: string;
  content: string;
  sourceUrl?: string;
}

// ─── /api/skills/firecrawl ────────────────────────────────────────────────────

export interface FirecrawlRefreshRequest {
  businessId: string;
  /** URLs / domains that are allowed for crawling (enforced server-side) */
  urls: string[];
}

export interface FirecrawlRefreshResponse {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  message?: string;
}

// ─── /api/conversations/* ────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessageRole: 'user' | 'assistant' | 'system' | 'tool' | null;
  messageCount: number;
  userMessageCount: number;
  preview: string;
}

export interface ConversationDetail {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: Array<ChatMessage & { metadata?: unknown }>;
}

// ─── /api/dashboard/stats ───────────────────────────────────────────────────

export interface DashboardStats {
  conversations: number;
  knowledgeDocuments: number;
  memoryFacts: number;
  crawlJobs: number;
}

// ─── /api/memory/* ────────────────────────────────────────────────────────────

export interface MemoryFact {
  id: string;
  threadId: string;
  fact: string;
  createdAt: string;
}

// ─── Generic API envelope ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
