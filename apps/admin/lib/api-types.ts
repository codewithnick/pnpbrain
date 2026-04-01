export interface DashboardStats {
  conversations: number;
  knowledgeDocuments: number;
  memoryFacts: number;
  crawlJobs: number;
}

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

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  metadata?: unknown;
}

export interface ConversationDetail {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

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
  createdAt: string;
  updatedAt: string;
}