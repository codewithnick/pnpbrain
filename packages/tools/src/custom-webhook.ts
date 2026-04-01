import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface CustomWebhookSkillDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  webhookUrl: string;
  inputSchema?: Record<string, unknown>;
}

interface CreateCustomWebhookToolOptions {
  skill: CustomWebhookSkillDefinition;
  context: {
    businessId: string;
    agentId?: string;
    conversationId: string;
  };
  timeoutMs?: number;
}

function normalizeToolName(key: string): string {
  const cleaned = key
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeKey = cleaned || 'custom_skill';
  return `custom_${safeKey}`.slice(0, 60);
}

export function createCustomWebhookTool(options: CreateCustomWebhookToolOptions): DynamicStructuredTool {
  const { skill, context } = options;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return new DynamicStructuredTool({
    name: normalizeToolName(skill.key),
    description:
      `${skill.name}. ${skill.description || 'User-defined webhook skill.'} `
      + 'Pass structured input as an object in the input field.',
    schema: z.object({
      input: z.record(z.unknown()).default({}),
    }),
    func: async ({ input }: { input: Record<string, unknown> }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(skill.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            skill: {
              id: skill.id,
              key: skill.key,
              name: skill.name,
            },
            context: {
              businessId: context.businessId,
              agentId: context.agentId,
              conversationId: context.conversationId,
            },
            input,
          }),
          signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok) {
          const errText = await response.text();
          return `Custom webhook skill failed (${response.status}): ${errText.slice(0, 500)}`;
        }

        if (contentType.includes('application/json')) {
          const payload = (await response.json()) as unknown;
          return JSON.stringify(payload, null, 2);
        }

        return await response.text();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return `Custom webhook skill timed out after ${timeoutMs}ms.`;
        }
        return `Custom webhook skill threw an error: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
