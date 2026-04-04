import { getDb } from '@pnpbrain/db/client';
import { agents, customAgentSkills } from '@pnpbrain/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

export interface CustomWebhookSkillRuntime {
  id: string;
  key: string;
  name: string;
  description: string;
  webhookUrl: string;
  inputSchema?: Record<string, unknown>;
}

export function normalizeSkillKey(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const normalized = trimmed
    .replace(/[^a-z0-9_-\s]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  return normalized;
}

function parseInputSchema(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getCustomSkillsForAgent(input: {
  businessId: string;
  agentId: string;
}) {
  const db = getDb();
  return db
    .select()
    .from(customAgentSkills)
    .where(
      and(
        eq(customAgentSkills.businessId, input.businessId),
        eq(customAgentSkills.agentId, input.agentId)
      )
    )
    .orderBy(asc(customAgentSkills.createdAt));
}

export async function getEnabledCustomWebhookSkillsForAgentScope(input: {
  businessId?: string;
  agentId?: string | null;
}): Promise<CustomWebhookSkillRuntime[]> {
  if (!input.businessId || !input.agentId) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(customAgentSkills)
    .where(
      and(
        eq(customAgentSkills.businessId, input.businessId),
        eq(customAgentSkills.agentId, input.agentId),
        eq(customAgentSkills.enabled, true)
      )
    )
    .orderBy(asc(customAgentSkills.createdAt));

  return rows.map((row) => {
    const parsedInputSchema = row.inputSchemaJson
      ? parseInputSchema(row.inputSchemaJson)
      : undefined;

    return {
      id: row.id,
      key: row.skillKey,
      name: row.name,
      description: row.description,
      webhookUrl: row.webhookUrl,
      ...(parsedInputSchema !== undefined ? { inputSchema: parsedInputSchema } : {}),
    };
  });
}

export async function createCustomSkill(input: {
  businessId: string;
  agentId: string;
  skillKey: string;
  name: string;
  description?: string;
  webhookUrl: string;
  inputSchema?: Record<string, unknown>;
  enabled?: boolean;
}) {
  const db = getDb();
  const [created] = await db
    .insert(customAgentSkills)
    .values({
      businessId: input.businessId,
      agentId: input.agentId,
      skillKey: input.skillKey,
      name: input.name,
      description: input.description ?? '',
      webhookUrl: input.webhookUrl,
      inputSchemaJson: input.inputSchema ? JSON.stringify(input.inputSchema) : null,
      enabled: input.enabled ?? true,
    })
    .returning();

  return created;
}

export async function updateCustomSkill(input: {
  businessId: string;
  agentId: string;
  skillId: string;
  skillKey?: string;
  name?: string;
  description?: string;
  webhookUrl?: string;
  inputSchema?: Record<string, unknown> | null;
  enabled?: boolean;
}) {
  const db = getDb();

  const payload: Record<string, unknown> = {
    updatedAt: sql`now()`,
  };

  if (input.skillKey !== undefined) payload['skillKey'] = input.skillKey;
  if (input.name !== undefined) payload['name'] = input.name;
  if (input.description !== undefined) payload['description'] = input.description;
  if (input.webhookUrl !== undefined) payload['webhookUrl'] = input.webhookUrl;
  if (input.inputSchema !== undefined) {
    payload['inputSchemaJson'] = input.inputSchema ? JSON.stringify(input.inputSchema) : null;
  }
  if (input.enabled !== undefined) payload['enabled'] = input.enabled;

  const [updated] = await db
    .update(customAgentSkills)
    .set(payload)
    .where(
      and(
        eq(customAgentSkills.id, input.skillId),
        eq(customAgentSkills.businessId, input.businessId),
        eq(customAgentSkills.agentId, input.agentId)
      )
    )
    .returning();

  return updated ?? null;
}

export async function deleteCustomSkill(input: {
  businessId: string;
  agentId: string;
  skillId: string;
}) {
  const db = getDb();
  const [deleted] = await db
    .delete(customAgentSkills)
    .where(
      and(
        eq(customAgentSkills.id, input.skillId),
        eq(customAgentSkills.businessId, input.businessId),
        eq(customAgentSkills.agentId, input.agentId)
      )
    )
    .returning({ id: customAgentSkills.id });

  return deleted ?? null;
}

export async function agentBelongsToBusiness(input: {
  businessId: string;
  agentId: string;
}) {
  const db = getDb();
  const [row] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.businessId, input.businessId)))
    .limit(1);

  return !!row;
}
