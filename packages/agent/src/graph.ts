/**
 * GCFIS LangGraph Agent Graph
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
  leadQualificationTool,
  meetingSchedulerTool,
  createMeetingBookingTool,
  createSupportTicketTool,
} from '@gcfis/tools';

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
      meetingIntegration,
      supportIntegration,
      createSupportTicket,
      llmProvider,
      llmModel,
      llmApiKey,
      llmBaseUrl,
    } = input;

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
    const allTools: DynamicStructuredTool[] = [];
    if (skills.includes('calculator')) allTools.push(calculatorTool);
    if (skills.includes('datetime')) allTools.push(datetimeTool);
    if (skills.includes('firecrawl')) allTools.push(createFirecrawlTool({ allowedDomains }));
    if (skills.includes('lead_qualification')) allTools.push(leadQualificationTool);
    if (skills.includes('meeting_scheduler')) {
      allTools.push(meetingSchedulerTool);
      allTools.push(
        createMeetingBookingTool({
          businessName,
          integration: normalizedMeetingIntegration,
        })
      );
    }
    if (skills.includes('support_escalation') && supportProvider !== 'none' && createSupportTicket) {
      allTools.push(
        createSupportTicketTool({
          createTicket: createSupportTicket,
        })
      );
    }

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

    const stream = graph.streamEvents({ messages: promptMessages }, { version: 'v2' });
    for await (const event of stream) {
      yield event;
    }
  }
}

const defaultAgentGraphService = new AgentGraphService();

export function createAgentGraph() {
  return defaultAgentGraphService.createAgentGraph();
}

export async function* runGraph(input: GraphInput) {
  yield* defaultAgentGraphService.runGraph(input);
}
