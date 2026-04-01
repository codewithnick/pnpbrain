import { getDb } from '@gcfis/db/client';
import {
  agentIntegrations,
  agentSkillSettings,
  SKILL_NAMES,
} from '@gcfis/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from './secrets';

const SKILL_SET = new Set<string>(SKILL_NAMES);
type SkillName = (typeof SKILL_NAMES)[number];

// ---------------------------------------------------------------------------
// Skill helpers (unchanged)
// ---------------------------------------------------------------------------

function parseSkillName(value: string): SkillName | null {
  return SKILL_SET.has(value) ? (value as SkillName) : null;
}

async function listEnabledSkillsForAgent(agentId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ skillName: agentSkillSettings.skillName })
    .from(agentSkillSettings)
    .where(and(eq(agentSkillSettings.agentId, agentId), eq(agentSkillSettings.enabled, true)));

  return rows.map((row) => row.skillName);
}

export async function getEnabledSkillsForAgentScope(input: {
  businessId?: string;
  agentId?: string | null;
}): Promise<string[]> {
  if (!input.agentId) {
    return [];
  }

  return listEnabledSkillsForAgent(input.agentId);
}

export async function setEnabledSkillsForAgent(
  agentId: string,
  skills: string[]
): Promise<void> {
  const sanitizedSkills: SkillName[] = [...new Set(skills)]
    .map((value) => parseSkillName(value))
    .filter((value): value is SkillName => value !== null);

  const db = getDb();

  await db
    .insert(agentSkillSettings)
    .values(SKILL_NAMES.map((skillName) => ({ agentId, skillName, enabled: false })))
    .onConflictDoNothing();

  await db
    .update(agentSkillSettings)
    .set({ enabled: false, updatedAt: sql`now()` })
    .where(eq(agentSkillSettings.agentId, agentId));

  if (sanitizedSkills.length === 0) return;

  await db
    .update(agentSkillSettings)
    .set({ enabled: true, updatedAt: sql`now()` })
    .where(
      and(
        eq(agentSkillSettings.agentId, agentId),
        inArray(agentSkillSettings.skillName, sanitizedSkills)
      )
    );
}

// ---------------------------------------------------------------------------
// Integration types
// ---------------------------------------------------------------------------

/** Provider-specific config stored in configJson. */
export interface IntegrationConfig {
  calendarId?: string;
  timezone?: string;
  schedulingUrl?: string;
  [key: string]: unknown;
}

/** Shape returned to the admin UI per integration row. */
export interface IntegrationStatus {
  provider: string;
  isDefault: boolean;
  /** true when the integration has an access token OR a Calendly scheduling URL. */
  connected: boolean;
  hasRefreshToken: boolean;
  config: IntegrationConfig;
}

/** Shape consumed by the agent/tool at runtime (pick the default integration). */
export interface MeetingIntegrationConfig {
  provider: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  config?: IntegrationConfig;
}

export interface SupportIntegrationConfig {
  provider: string;
  accessToken?: string;
  config?: {
    subdomain?: string;
    supportEmail?: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Integration helpers
// ---------------------------------------------------------------------------

function parseConfigJson(raw: string | null | undefined): IntegrationConfig {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as IntegrationConfig;
  } catch {
    return {};
  }
}

type IntegrationRow = {
  id: string;
  provider: string;
  isDefault: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  configJson: string | null;
};

async function backfillEncryptedAgentTokensIfNeeded(row: {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
}): Promise<void> {
  const encryptedAccess = encryptSecret(row.accessToken);
  const encryptedRefresh = encryptSecret(row.refreshToken);

  if (encryptedAccess === row.accessToken && encryptedRefresh === row.refreshToken) {
    return;
  }

  const db = getDb();
  await db
    .update(agentIntegrations)
    .set({
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      updatedAt: sql`now()`,
    })
    .where(eq(agentIntegrations.id, row.id));
}

async function getAgentIntegrationRows(agentId: string): Promise<IntegrationRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentIntegrations)
    .where(eq(agentIntegrations.agentId, agentId));

  await Promise.all(rows.map((row) => backfillEncryptedAgentTokensIfNeeded(row)));
  return rows;
}

function mapIntegrationRows(rows: IntegrationRow[]): IntegrationStatus[] {
  return rows.map((row) => {
    const config = parseConfigJson(row.configJson);
    return {
      provider: row.provider,
      isDefault: row.isDefault,
      connected: !!row.accessToken || !!config.schedulingUrl,
      hasRefreshToken: !!row.refreshToken,
      config,
    };
  });
}

function pickMeetingIntegration(rows: IntegrationRow[]): MeetingIntegrationConfig {
  if (rows.length === 0) return { provider: 'none' };

  const meetingProviders = new Set(['google', 'zoom', 'calendly']);
  const meetingRows = rows.filter((r) => meetingProviders.has(r.provider));
  if (meetingRows.length === 0) return { provider: 'none' };

  const defaultRow = meetingRows.find((r) => r.isDefault);
  const connectedRow = meetingRows.find((r) => {
    const cfg = parseConfigJson(r.configJson);
    return !!r.accessToken || !!cfg.schedulingUrl;
  });
  const row = defaultRow ?? connectedRow;

  if (!row) return { provider: 'none' };

  const config = parseConfigJson(row.configJson);
  const accessToken = decryptSecret(row.accessToken);
  const refreshToken = decryptSecret(row.refreshToken);
  return {
    provider: row.provider,
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(row.tokenExpiresAt ? { tokenExpiresAt: row.tokenExpiresAt.toISOString() } : {}),
    ...(Object.keys(config).length > 0 ? { config } : {}),
  };
}

function pickSupportIntegration(rows: IntegrationRow[]): SupportIntegrationConfig {
  const SUPPORT_PROVIDERS = new Set(['zendesk', 'freshdesk']);
  const supportRows = rows.filter((row) => SUPPORT_PROVIDERS.has(row.provider));
  if (supportRows.length === 0) return { provider: 'none' };

  const defaultRow = supportRows.find((row) => row.isDefault);
  const configuredRow = supportRows.find((row) => {
    const cfg = parseConfigJson(row.configJson);
    if (!row.accessToken) return false;
    if (row.provider === 'freshdesk') return typeof cfg['domain'] === 'string';
    return typeof cfg['subdomain'] === 'string' && typeof cfg['supportEmail'] === 'string';
  });
  const row = defaultRow ?? configuredRow ?? supportRows[0];
  if (!row) return { provider: 'none' };

  const accessToken = decryptSecret(row.accessToken);
  const config = parseConfigJson(row.configJson);
  return {
    provider: row.provider,
    ...(accessToken ? { accessToken } : {}),
    ...(Object.keys(config).length > 0 ? { config } : {}),
  };
}

export async function getAllIntegrationsForAgentScope(input: {
  businessId?: string;
  agentId?: string | null;
}): Promise<IntegrationStatus[]> {
  if (!input.agentId) {
    return [];
  }

  const agentRows = await getAgentIntegrationRows(input.agentId);
  return mapIntegrationRows(agentRows);
}

export async function upsertIntegrationForAgent(
  agentId: string,
  provider: string,
  data: {
    isDefault?: boolean;
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
    configJson?: string | null;
  }
): Promise<void> {
  const db = getDb();

  if (data.isDefault) {
    await db
      .update(agentIntegrations)
      .set({ isDefault: false, updatedAt: sql`now()` })
      .where(and(eq(agentIntegrations.agentId, agentId), eq(agentIntegrations.isDefault, true)));
  }

  await db
    .insert(agentIntegrations)
    .values({
      agentId,
      provider,
      isDefault: data.isDefault ?? false,
      accessToken: encryptSecret(data.accessToken),
      refreshToken: encryptSecret(data.refreshToken),
      tokenExpiresAt: data.tokenExpiresAt ?? null,
      configJson: data.configJson ?? null,
    })
    .onConflictDoUpdate({
      target: [agentIntegrations.agentId, agentIntegrations.provider],
      set: {
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.accessToken !== undefined
          ? { accessToken: encryptSecret(data.accessToken) }
          : {}),
        ...(data.refreshToken !== undefined
          ? { refreshToken: encryptSecret(data.refreshToken) }
          : {}),
        ...(data.tokenExpiresAt !== undefined ? { tokenExpiresAt: data.tokenExpiresAt } : {}),
        ...(data.configJson !== undefined ? { configJson: data.configJson } : {}),
        updatedAt: sql`now()`,
      },
    });
}

export async function disconnectIntegrationForAgent(
  agentId: string,
  provider: string
): Promise<void> {
  const db = getDb();
  await db
    .update(agentIntegrations)
    .set({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isDefault: false,
      updatedAt: sql`now()`,
    })
    .where(and(eq(agentIntegrations.agentId, agentId), eq(agentIntegrations.provider, provider)));
}

/**
 * Get the active meeting integration for use at agent runtime.
 * Returns the row marked isDefault first; falls back to the first connected row.
 */
export async function getMeetingIntegrationForAgentScope(input: {
  businessId?: string;
  agentId?: string | null;
}): Promise<MeetingIntegrationConfig> {
  if (!input.agentId) {
    return { provider: 'none' };
  }

  const agentRows = await getAgentIntegrationRows(input.agentId);
  return pickMeetingIntegration(agentRows);
}

export async function getSupportIntegrationForAgentScope(input: {
  businessId?: string;
  agentId?: string | null;
}): Promise<SupportIntegrationConfig> {
  if (!input.agentId) {
    return { provider: 'none' };
  }

  const agentRows = await getAgentIntegrationRows(input.agentId);
  return pickSupportIntegration(agentRows);
}
