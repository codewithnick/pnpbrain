/**
 * PNpbrain LangGraph Agent Graph
 *
 * Graph Flow:
 *   START
 *     └─► decide      (LLM decides: respond directly or call a tool)
 *           ├─► tools  (if tool_calls present — ToolNode)
 *           │     └─► decide (loop back)
 *           └─► END
 */

import {
  END,
  START,
  StateGraph,
  MessagesAnnotation,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  BaseMessage,
} from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';

import { LlmService, type LlmOptions } from './llm.js';
import { buildSystemPrompt } from './prompts.js';
import { RagService } from './rag.js';
import { MemoryService } from './memory.js';
import {
  createFirecrawlTool,
  calculatorTool,
  datetimeTool,
  createHttpRequestTool,
  createWebPagePreviewTool,
  createIframeEmbedTool,
  createCustomWebhookTool,
  leadQualificationTool,
  meetingSchedulerTool,
  createMeetingBookingTool,
  createSupportTicketTool,
  createLeadHandoffTool,
  type CustomWebhookSkillDefinition,
} from '@pnpbrain/tools';

interface MeetingIntegrationConfig {
  provider: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  config?: {
    calendarId?: string;
    timezone?: string;
    schedulingUrl?: string;
    [key: string]: unknown;
  };
}

function buildRuntimeTools(input: {
  businessId: string;
  agentId?: string;
  conversationId: string;
  allowedDomains: string[];
  businessName: string;
  enabledSkills?: string[];
  customSkills?: CustomWebhookSkillDefinition[];
  meetingIntegration?: Record<string, unknown>;
  supportIntegration?: Record<string, unknown>;
  createSupportTicket?: GraphInput['createSupportTicket'];
  createLeadHandoff?: GraphInput['createLeadHandoff'];
}): DynamicStructuredTool[] {
  const {
    businessId,
    agentId,
    conversationId,
    allowedDomains,
    businessName,
    enabledSkills,
    customSkills,
    meetingIntegration,
    supportIntegration,
    createSupportTicket,
    createLeadHandoff,
  } = input;

  const skills = enabledSkills ?? ['calculator', 'datetime', 'firecrawl'];
  const normalizedMeetingIntegration: MeetingIntegrationConfig = {
    provider:
      typeof meetingIntegration?.['provider'] === 'string'
        ? meetingIntegration['provider']
        : 'none',
    ...(typeof meetingIntegration?.['accessToken'] === 'string'
      ? { accessToken: meetingIntegration['accessToken'] }
      : {}),
    ...(typeof meetingIntegration?.['refreshToken'] === 'string'
      ? { refreshToken: meetingIntegration['refreshToken'] }
      : {}),
    ...(typeof meetingIntegration?.['tokenExpiresAt'] === 'string'
      ? { tokenExpiresAt: meetingIntegration['tokenExpiresAt'] }
      : {}),
    ...(meetingIntegration?.['config'] && typeof meetingIntegration['config'] === 'object'
      ? { config: meetingIntegration['config'] as NonNullable<MeetingIntegrationConfig['config']> }
      : {}),
  };

  const supportProvider =
    typeof supportIntegration?.['provider'] === 'string'
      ? supportIntegration['provider']
      : 'none';

  const tools: DynamicStructuredTool[] = [];
  const toolEntries: Array<{
    enabled: boolean;
    tool: DynamicStructuredTool;
    label: string;
  }> = [
    { enabled: skills.includes('calculator'), tool: calculatorTool, label: 'calculator' },
    { enabled: skills.includes('datetime'), tool: datetimeTool, label: 'datetime' },
    {
      enabled: skills.includes('firecrawl'),
      tool: createFirecrawlTool({ allowedDomains }),
      label: 'firecrawl',
    },
    {
      enabled: skills.includes('lead_qualification'),
      tool: leadQualificationTool,
      label: 'lead_qualification',
    },
    {
      enabled: skills.includes('lead_qualification') && !!createLeadHandoff,
      tool: createLeadHandoff
        ? createLeadHandoffTool({ createLeadHandoff })
        : leadQualificationTool,
      label: 'lead handoff routing',
    },
    {
      enabled: skills.includes('meeting_scheduler'),
      tool: meetingSchedulerTool,
      label: 'meeting_scheduler',
    },
    {
      enabled: skills.includes('meeting_scheduler'),
      tool: createMeetingBookingTool({ businessName, integration: normalizedMeetingIntegration }),
      label: 'meeting booking',
    },
    {
      enabled: skills.includes('support_escalation') && supportProvider !== 'none' && !!createSupportTicket,
      tool: createSupportTicket
        ? createSupportTicketTool({ createTicket: createSupportTicket })
        : calculatorTool,
      label: 'support_escalation',
    },
    {
      enabled: skills.includes('http_requests'),
      tool: createHttpRequestTool({ allowedDomains }),
      label: 'http_requests',
    },
    {
      enabled: skills.includes('web_preview'),
      tool: createWebPagePreviewTool({ allowedDomains }),
      label: 'web_preview',
    },
    {
      enabled: skills.includes('iframe_embed'),
      tool: createIframeEmbedTool({ allowedDomains }),
      label: 'iframe_embed',
    },
  ];

  for (const entry of toolEntries) {
    if (!entry.enabled) continue;
    tools.push(entry.tool);
    console.log(`[AGENT/graph]   ✓ Added ${entry.label}`);
  }

  for (const customSkill of customSkills ?? []) {
    tools.push(
      createCustomWebhookTool({
        skill: customSkill,
        context: {
          businessId,
          ...(agentId ? { agentId } : {}),
          conversationId,
        },
      })
    );
    console.log(`[AGENT/graph]   ✓ Added custom skill ${customSkill.key}`);
  }

  return tools;
}

export interface GraphInput {
  businessId: string;
  agentId?: string;
  conversationId: string;
  botName: string;
  businessName: string;
  allowedDomains: string[];
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  enabledSkills?: string[];
  customSkills?: CustomWebhookSkillDefinition[];
  meetingIntegration?: Record<string, unknown>;
  supportIntegration?: Record<string, unknown>;
  createSupportTicket?: (payload: {
    reason: string;
    customerMessage: string;
    customerEmail?: string;
    customerName?: string;
  }) => Promise<{
    status: 'created' | 'failed';
    provider: string;
    externalTicketId?: string;
    externalTicketUrl?: string;
    message: string;
  }>;
  createLeadHandoff?: (payload: {
    reason: string;
    qualificationScore?: number;
    qualificationStage?: 'nurture' | 'mql' | 'sql';
    customerMessage: string;
    summary: string;
    customerEmail?: string;
    customerName?: string;
    companyName?: string;
  }) => Promise<{
    status: 'created' | 'failed';
    provider: string;
    externalRecordId?: string;
    externalRecordUrl?: string;
    message: string;
  }>;
  llmProvider?: string;
  llmModel?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
}

export interface AgentGraphServiceDeps {
  llmService?: LlmService;
  ragService?: RagService;
  memoryService?: MemoryService;
}

export class AgentGraphService {
  private readonly llmService: LlmService;
  private readonly ragService: RagService;
  private readonly memoryService: MemoryService;

  constructor(deps: AgentGraphServiceDeps = {}) {
    this.llmService = deps.llmService ?? new LlmService();
    this.ragService = deps.ragService ?? new RagService();
    this.memoryService = deps.memoryService ?? new MemoryService();
  }

  public createAgentGraph() {
    const tools: DynamicStructuredTool[] = [calculatorTool, datetimeTool];
    const toolNode = new ToolNode(tools);

    const llm = this.llmService.getModel({ streaming: true });
    const llmWithTools =
      typeof llm.bindTools === 'function' ? llm.bindTools(tools) : llm;

    async function decideNode(state: typeof MessagesAnnotation.State) {
      const response = await llmWithTools.invoke(state.messages);
      return { messages: [response] };
    }

    function shouldUseTool(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
      const lastMessage = state.messages.at(-1);
      if (
        lastMessage &&
        'tool_calls' in lastMessage &&
        Array.isArray(lastMessage.tool_calls) &&
        lastMessage.tool_calls.length > 0
      ) {
        return 'tools';
      }
      return END;
    }

    const graph = new StateGraph(MessagesAnnotation)
      .addNode('decide', decideNode)
      .addNode('tools', toolNode)
      .addEdge(START, 'decide')
      .addConditionalEdges('decide', shouldUseTool)
      .addEdge('tools', 'decide');

    return graph.compile();
  }

  public async *runGraph(input: GraphInput) {
    console.log('[AGENT/graph] 🚀 Starting runGraph');
    const {
      businessId,
      agentId,
      conversationId,
      botName,
      businessName,
      allowedDomains,
      userMessage,
      conversationHistory,
      enabledSkills,
      customSkills,
      meetingIntegration,
      supportIntegration,
      createSupportTicket,
      llmProvider,
      llmModel,
      llmApiKey,
      llmBaseUrl,
    } = input;
    console.log('[AGENT/graph] Enabled skills:', enabledSkills);

    const [ragChunks, memFacts, agentMemFacts] = await Promise.all([
      this.ragService.retrieveKnowledgeChunks(businessId, agentId, userMessage),
      this.memoryService.loadMemoryFacts(conversationId),
      this.memoryService.loadAgentMemoryFacts(businessId, agentId),
    ]);

    const allMemoryFacts = [...agentMemFacts, ...memFacts];

    const systemPrompt = buildSystemPrompt({
      botName,
      businessName,
      ragContext: this.ragService.formatRagContext(ragChunks),
      memoryFacts: this.memoryService.formatMemoryFacts(allMemoryFacts),
      currentDateTime: new Date().toISOString(),
    });

    const skills = enabledSkills ?? ['calculator', 'datetime', 'firecrawl'];
    console.log('[AGENT/graph] Skills to use:', skills);
    console.log('[AGENT/graph] Building tools list...');
    const allTools = buildRuntimeTools({
      businessId,
      ...(agentId ? { agentId } : {}),
      conversationId,
      allowedDomains,
      businessName,
      enabledSkills: skills,
      ...(customSkills ? { customSkills } : {}),
      ...(meetingIntegration ? { meetingIntegration } : {}),
      ...(supportIntegration ? { supportIntegration } : {}),
      ...(createSupportTicket ? { createSupportTicket } : {}),
      ...(input.createLeadHandoff ? { createLeadHandoff: input.createLeadHandoff } : {}),
    });
    console.log('[AGENT/graph] Total tools created:', allTools.length);

    const llmOptions: LlmOptions = { streaming: true };
    if (llmProvider) llmOptions.provider = llmProvider as NonNullable<LlmOptions['provider']>;
    if (llmModel) llmOptions.model = llmModel;
    if (llmApiKey) llmOptions.apiKey = llmApiKey;
    if (llmBaseUrl) llmOptions.baseUrl = llmBaseUrl;

    const llm = this.llmService.getModel(llmOptions);
    const llmWithTools =
      typeof llm.bindTools === 'function' ? llm.bindTools(allTools) : llm;
    const toolNode = new ToolNode(allTools);

    async function decideNode(state: typeof MessagesAnnotation.State) {
      const response = await llmWithTools.invoke(state.messages);
      return { messages: [response] };
    }

    function shouldUseTool(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
      const last = state.messages.at(-1);
      if (last && 'tool_calls' in last && Array.isArray(last.tool_calls) && last.tool_calls.length > 0) {
        return 'tools';
      }
      return END;
    }

    const graph = new StateGraph(MessagesAnnotation)
      .addNode('decide', decideNode)
      .addNode('tools', toolNode)
      .addEdge(START, 'decide')
      .addConditionalEdges('decide', shouldUseTool)
      .addEdge('tools', 'decide')
      .compile();

    const historyMessages: BaseMessage[] = (conversationHistory ?? []).map((message) => {
      if (message.role === 'system') {
        return new SystemMessage(message.content);
      }
      if (message.role === 'assistant') {
        return new AIMessage(message.content);
      }
      return new HumanMessage(message.content);
    });

    const promptMessages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...historyMessages,
      new HumanMessage(userMessage),
    ];

    console.log('[AGENT/graph] ▶️ Starting graph stream execution');
    const stream = graph.streamEvents({ messages: promptMessages }, { version: 'v2' });
    let eventIndex = 0;
    const eventTypesSeen = new Set<string>();
    for await (const event of stream) {
      eventIndex++;
      const eventType = event.event;
      eventTypesSeen.add(eventType);
      const eventData = (event.data ?? {}) as Record<string, unknown>;
      
      // Log all events to see what we're receiving
      console.log(`[AGENT/graph] 📊 Event #${eventIndex}: type="${eventType}" | keys=${Object.keys(event).join(',')}`);
      
      if (eventType === 'on_tool_start') {
        const toolName = (eventData['tool'] as string | undefined) ?? 'unknown';
        console.log(`[AGENT/graph] 🔧 TOOL START (#${eventIndex}):`, toolName);
        console.log('[AGENT/graph]   Input:', JSON.stringify(eventData['input'] ?? {}).substring(0, 100));
      } else if (eventType === 'on_tool_end') {
        const toolName = (eventData['tool'] as string | undefined) ?? 'unknown';
        console.log(`[AGENT/graph] ✅ TOOL END (#${eventIndex}):`, toolName);
        console.log('[AGENT/graph]   Output:', JSON.stringify(eventData['output'] ?? '').substring(0, 100));
      } else if (eventType === 'on_tool_error') {
        const toolName = (eventData['tool'] as string | undefined) ?? 'unknown';
        console.log(`[AGENT/graph] ❌ TOOL ERROR (#${eventIndex}):`, toolName);
        console.log('[AGENT/graph]   Error:', eventData['error'] ?? 'unknown');
      } else if (eventType === 'on_chat_model_stream') {
        const token = event.data?.chunk?.content || '';
        if (token) {
          console.log(`[AGENT/graph] 📝 Model stream (#${eventIndex}): "${token}"`);
        }
      }
      
      yield event;
    }
    console.log('[AGENT/graph] ✨ Graph stream complete - total events:', eventIndex);
    console.log('[AGENT/graph] Event types seen:', Array.from(eventTypesSeen).join(', '));
  }
}

const defaultAgentGraphService = new AgentGraphService();

export function createAgentGraph() {
  return defaultAgentGraphService.createAgentGraph();
}

export async function* runGraph(input: GraphInput) {
  yield* defaultAgentGraphService.runGraph(input);
}
