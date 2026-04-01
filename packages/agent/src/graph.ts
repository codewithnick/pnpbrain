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
  MemorySaver,
  START,
  StateGraph,
  MessagesAnnotation,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
  SystemMessage,
  HumanMessage,
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
} from '@gcfis/tools';

interface MeetingIntegrationConfig {
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

export interface GraphInput {
  businessId: string;
  conversationId: string;
  botName: string;
  businessName: string;
  allowedDomains: string[];
  userMessage: string;
  enabledSkills?: string[];
  meetingIntegration?: Record<string, unknown>;
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

    const checkpointer = new MemorySaver();
    return graph.compile({ checkpointer });
  }

  public async *runGraph(input: GraphInput) {
    const {
      businessId,
      conversationId,
      botName,
      businessName,
      allowedDomains,
      userMessage,
      enabledSkills,
      meetingIntegration,
      llmProvider,
      llmModel,
      llmApiKey,
      llmBaseUrl,
    } = input;

    const [ragChunks, memFacts] = await Promise.all([
      this.ragService.retrieveKnowledgeChunks(businessId, userMessage),
      this.memoryService.loadMemoryFacts(conversationId),
    ]);

    const systemPrompt = buildSystemPrompt({
      botName,
      businessName,
      ragContext: this.ragService.formatRagContext(ragChunks),
      memoryFacts: this.memoryService.formatMemoryFacts(memFacts),
      currentDateTime: new Date().toISOString(),
    });

    const skills = enabledSkills ?? ['calculator', 'datetime', 'firecrawl'];
    const normalizedMeetingIntegration: MeetingIntegrationConfig = {
      provider:
        typeof meetingIntegration?.['provider'] === 'string'
          ? (meetingIntegration['provider'] as MeetingIntegrationConfig['provider'])
          : 'none',
      ...(typeof meetingIntegration?.['timezone'] === 'string'
        ? { timezone: meetingIntegration['timezone'] }
        : {}),
      ...(typeof meetingIntegration?.['calendarId'] === 'string'
        ? { calendarId: meetingIntegration['calendarId'] }
        : {}),
      ...(typeof meetingIntegration?.['googleAccessToken'] === 'string'
        ? { googleAccessToken: meetingIntegration['googleAccessToken'] }
        : {}),
      ...(typeof meetingIntegration?.['googleRefreshToken'] === 'string'
        ? { googleRefreshToken: meetingIntegration['googleRefreshToken'] }
        : {}),
      ...(typeof meetingIntegration?.['googleAccessTokenExpiresAt'] === 'string'
        ? { googleAccessTokenExpiresAt: meetingIntegration['googleAccessTokenExpiresAt'] }
        : {}),
      ...(typeof meetingIntegration?.['zoomAccessToken'] === 'string'
        ? { zoomAccessToken: meetingIntegration['zoomAccessToken'] }
        : {}),
      ...(typeof meetingIntegration?.['zoomRefreshToken'] === 'string'
        ? { zoomRefreshToken: meetingIntegration['zoomRefreshToken'] }
        : {}),
      ...(typeof meetingIntegration?.['zoomAccessTokenExpiresAt'] === 'string'
        ? { zoomAccessTokenExpiresAt: meetingIntegration['zoomAccessTokenExpiresAt'] }
        : {}),
      ...(typeof meetingIntegration?.['calendlySchedulingUrl'] === 'string'
        ? { calendlySchedulingUrl: meetingIntegration['calendlySchedulingUrl'] }
        : {}),
    };
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
      .compile({ checkpointer: new MemorySaver() });

    const threadConfig = { configurable: { thread_id: conversationId } };
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ];

    const stream = graph.streamEvents({ messages }, { ...threadConfig, version: 'v2' });
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
