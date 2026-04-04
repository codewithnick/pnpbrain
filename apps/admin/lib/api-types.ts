export interface DashboardStats {
  conversations: number;
  knowledgeDocuments: number;
  memoryFacts: number;
  crawlJobs: number;
}

export interface Agent {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
  allowedDomains: string[];
  llmProvider: string;
  llmModel: string;
  llmApiKey?: string | null;
  llmBaseUrl?: string | null;
  primaryColor: string;
  botName: string;
  welcomeMessage: string;
  placeholder: string;
  widgetPosition: 'bottom-right' | 'bottom-left';
  widgetTheme: 'light' | 'dark';
  showAvatar: boolean;
  assistantAvatarMode: 'initial' | 'emoji' | 'image';
  assistantAvatarText: string;
  assistantAvatarImageUrl?: string | null;
  showAssistantAvatar: boolean;
  showUserAvatar: boolean;
  userAvatarText: string;
  headerSubtitle: string;
  chatBackgroundColor: string;
  userMessageColor?: string | null;
  assistantMessageColor: string;
  borderRadiusPx: number;
  showPoweredBy: boolean;
  agentApiKey?: string | null;
  archivedAt?: string | null;
  enabledSkills?: string[];
  integrations?: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomAgentSkill {
  id: string;
  businessId: string;
  agentId: string;
  skillKey: string;
  name: string;
  description: string;
  webhookUrl: string;
  inputSchemaJson?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardUsage {
  credits: {
    used: number;
    included: number | null;
    remaining: number | null;
    percentUsed: number | null;
    unit: 'message';
    planTier: 'freemium' | 'lite' | 'basic' | 'pro' | 'custom';
    planLabel: string;
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

export interface DashboardTrendPoint {
  date: string;
  conversations: number;
  userMessages: number;
  assistantMessages: number;
  memoryFacts: number;
  crawlJobs: number;
  creditsUsed: number;
  firecrawlQueued: number;
  firecrawlRunning: number;
  firecrawlDone: number;
  firecrawlError: number;
  modelUsage: Record<string, number>;
}

export interface DashboardTrends {
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  points: DashboardTrendPoint[];
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
  assistantMessageCount?: number;
  firstResponseMs?: number | null;
  conversationDurationMs?: number | null;
  preview: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  responseTimeMs?: number | null;
  metadata?: unknown;
}

export interface ConversationDetail {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

export interface MemoryFactItem {
  id: string;
  businessId: string;
  conversationId: string;
  fact: string;
  createdAt: string;
}

export interface AgentMemoryFactItem {
  id: string;
  businessId: string;
  fact: string;
  source: string;
  createdAt: string;
  updatedAt: string;
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