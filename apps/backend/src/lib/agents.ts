import { randomBytes } from 'node:crypto';
import { getDb } from '@gcfis/db/client';
import { agents } from '@gcfis/db/schema';
import type { Agent } from '@gcfis/db';
import { and, eq, sql } from 'drizzle-orm';

export function generateAgentApiKey(): string {
  return `gcfis_live_${randomBytes(24).toString('base64url')}`;
}

export async function getAgentById(agentId: string): Promise<Agent | null> {
  const db = getDb();
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  return agent ?? null;
}

export async function getAgentByApiKey(apiKey: string): Promise<Agent | null> {
  if (!apiKey || !apiKey.startsWith('gcfis_live_')) return null;

  const db = getDb();
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.agentApiKey, apiKey))
    .limit(1);

  return agent ?? null;
}

export async function getDefaultAgentForBusiness(businessId: string): Promise<Agent | null> {
  const db = getDb();
  const [defaultAgent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.businessId, businessId), eq(agents.isDefault, true)))
    .limit(1);

  return defaultAgent ?? null;
}

export async function resolveAgentForBusiness(
  businessId: string,
  requestedAgentId?: string | null,
): Promise<Agent | null> {
  if (requestedAgentId) {
    const db = getDb();
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, requestedAgentId), eq(agents.businessId, businessId)))
      .limit(1);

    if (agent) return agent;
  }

  return getDefaultAgentForBusiness(businessId);
}

export async function ensureAgentApiKey(agent: Agent): Promise<Agent> {
  if (agent.agentApiKey) {
    return agent;
  }

  const db = getDb();
  const [updated] = await db
    .update(agents)
    .set({ agentApiKey: generateAgentApiKey(), updatedAt: sql`now()` })
    .where(eq(agents.id, agent.id))
    .returning();

  return updated ?? agent;
}