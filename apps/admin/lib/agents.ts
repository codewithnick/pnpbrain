import type { Agent } from './api-types';
import { fetchBackend, getSelectedAgentId } from './supabase';

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetchBackend('/api/agents');
  if (!res.ok) {
    throw new Error('Failed to load agents');
  }

  const json = (await res.json()) as { data?: Agent[] };
  return Array.isArray(json.data) ? json.data : [];
}

export function resolveActiveAgent(agents: Agent[]): Agent | null {
  if (agents.length === 0) return null;

  const selected = getSelectedAgentId();
  if (selected) {
    const match = agents.find((agent) => agent.id === selected);
    if (match) return match;
  }

  const defaultAgent = agents.find((agent) => agent.isDefault);
  return defaultAgent ?? agents[0] ?? null;
}
