/**
 * Agent-related types for the LangGraph agent pipeline.
 */

/** A single message in a conversation thread. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** ISO-8601 timestamp */
  createdAt: string;
  /** Optional tool call name if role === 'tool' */
  toolName?: string;
}

/** The full state object that lives in the LangGraph checkpointer. */
export interface AgentState {
  /** Conversation thread ID (Supabase row ID or UUID) */
  threadId: string;
  /** Ordered list of messages in this thread */
  messages: ChatMessage[];
  /** Extracted long-term memory facts for this user */
  memoryFacts: string[];
  /** Retrieved knowledge-base chunks (RAG context) */
  ragContext: RagChunk[];
  /** Which skills are enabled for this business */
  enabledSkills: SkillName[];
  /** Current step inside the graph (for streaming UI) */
  currentStep?: AgentStep;
}

/** Available agent graph steps — used for streaming step events. */
export type AgentStep =
  | 'idle'
  | 'retrieving_memory'
  | 'retrieving_knowledge'
  | 'deciding'
  | 'calling_tool'
  | 'generating_response'
  | 'done';

/** A chunk retrieved from the knowledge base via pgvector. */
export interface RagChunk {
  id: string;
  content: string;
  /** Cosine similarity score [0, 1] */
  score: number;
  sourceUrl?: string;
  sourceTitle?: string;
}

/** Meeting provider config saved per business and used by booking tools. */
export interface MeetingIntegrationConfig {
  provider: 'none' | 'google' | 'zoom' | 'calendly';
  timezone?: string;
  calendarId?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleAccessTokenExpiresAt?: string;
  zoomAccessToken?: string;
  zoomRefreshToken?: string;
  zoomAccessTokenExpiresAt?: string;
  calendlySchedulingUrl?: string;
}

/** Names of available agent skills / tools. */
export type SkillName =
  | 'firecrawl'
  | 'calculator'
  | 'datetime'
  | 'lead_qualification'
  | 'meeting_scheduler'
  | 'web_search';
