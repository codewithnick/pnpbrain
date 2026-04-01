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
  /** Backend-issued public chat token used by hosted/public clients */
  publicToken?: string;
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

export interface SupportEscalationRequest {
  threadId: string;
  customerMessage: string;
  customerEmail?: string;
  customerName?: string;
  reason?: string;
  publicToken?: string;
}

export interface SupportEscalationResponse {
  status: 'created' | 'failed';
  provider: string;
  externalTicketId?: string;
  externalTicketUrl?: string;
  message: string;
}

// ─── /api/knowledge/* ────────────────────────────────────────────────────────

export interface KnowledgeDocument {
  id: string;
  businessId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  s3Bucket?: string | null;
  s3Key?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
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

export interface DashboardUsage {
  credits: {
    used: number;
    included: number | null;
    remaining: number | null;
    percentUsed: number | null;
    unit: 'credit';
  };
  totals: {
    conversations: number;
    knowledgeDocuments: number;
    memoryFacts: number;
    userMessages: number;
    assistantMessages: number;
  };
  skills: {
    enabled: string[];
    enabledCount: number;
    trackedUsage: {
      firecrawl: {
        totalRuns: number;
        successfulRuns: number;
        failedRuns: number;
      };
      supportEscalation: {
        totalTickets: number;
        successfulTickets: number;
        failedTickets: number;
      };
    };
  };
}

// ─── /api/memory/* ────────────────────────────────────────────────────────────

export interface MemoryFact {
  id: string;
  threadId: string;
  fact: string;
  createdAt: string;
}

// ─── /api/team/* ─────────────────────────────────────────────────────────────

import type { BusinessMemberRole } from './user.js';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  role: BusinessMemberRole;
  invitedBy: string | null;
  createdAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: Exclude<BusinessMemberRole, 'owner'>;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface InviteTeamMemberRequest {
  email: string;
  role: Exclude<BusinessMemberRole, 'owner'>;
}

export interface InviteTeamMemberResponse {
  invitation: PendingInvitation;
  /** Full accept URL — share with the invitee. */
  acceptUrl: string;
}

export interface UpdateMemberRoleRequest {
  role: Exclude<BusinessMemberRole, 'owner'>;
}

export interface AcceptInvitationRequest {
  token: string;
}

export interface InvitationDetail {
  id: string;
  businessName: string;
  email: string;
  role: Exclude<BusinessMemberRole, 'owner'>;
  expiresAt: string;
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
