import { getDb } from '@gcfis/db/client';
import {
  businessIntegrations,
  businessSkillSettings,
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

export async function getEnabledSkillsForBusiness(businessId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ skillName: businessSkillSettings.skillName })
    .from(businessSkillSettings)
    .where(
      and(
        eq(businessSkillSettings.businessId, businessId),
        eq(businessSkillSettings.enabled, true)
      )
    );
  return rows.map((row) => row.skillName);
}

export async function setEnabledSkillsForBusiness(
  businessId: string,
  skills: string[]
): Promise<void> {
  const sanitizedSkills: SkillName[] = [...new Set(skills)]
    .map((value) => parseSkillName(value))
    .filter((value): value is SkillName => value !== null);

  const db = getDb();

  await db
    .insert(businessSkillSettings)
    .values(SKILL_NAMES.map((skillName) => ({ businessId, skillName, enabled: false })))
    .onConflictDoNothing();

  await db
    .update(businessSkillSettings)
    .set({ enabled: false, updatedAt: sql`now()` })
    .where(eq(businessSkillSettings.businessId, businessId));

  if (sanitizedSkills.length === 0) return;

  await db
    .update(businessSkillSettings)
    .set({ enabled: true, updatedAt: sql`now()` })
    .where(
      and(
        eq(businessSkillSettings.businessId, businessId),
        inArray(businessSkillSettings.skillName, sanitizedSkills)
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

async function backfillEncryptedTokensIfNeeded(row: {
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
    .update(businessIntegrations)
    .set({
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      updatedAt: sql`now()`,
    })
    .where(eq(businessIntegrations.id, row.id));
}

export async function getAllIntegrationsForBusiness(
  businessId: string
): Promise<IntegrationStatus[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(businessIntegrations)
    .where(eq(businessIntegrations.businessId, businessId));

  await Promise.all(rows.map((row) => backfillEncryptedTokensIfNeeded(row)));

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

export async function upsertIntegration(
  businessId: string,
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

  // Clear the current default from other rows when this one becomes default.
  if (data.isDefault) {
    await db
      .update(businessIntegrations)
      .set({ isDefault: false, updatedAt: sql`now()` })
      .where(
        and(
          eq(businessIntegrations.businessId, businessId),
          eq(businessIntegrations.isDefault, true)
        )
      );
  }

  await db
    .insert(businessIntegrations)
    .values({
      businessId,
      provider,
      isDefault: data.isDefault ?? false,
      accessToken: encryptSecret(data.accessToken),
      refreshToken: encryptSecret(data.refreshToken),
      tokenExpiresAt: data.tokenExpiresAt ?? null,
      configJson: data.configJson ?? null,
    })
    .onConflictDoUpdate({
      target: [businessIntegrations.businessId, businessIntegrations.provider],
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

export async function disconnectIntegration(
  businessId: string,
  provider: string
): Promise<void> {
  const db = getDb();
  await db
    .update(businessIntegrations)
    .set({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isDefault: false,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(businessIntegrations.businessId, businessId),
        eq(businessIntegrations.provider, provider)
      )
    );
}

/**
 * Get the active meeting integration for use at agent runtime.
 * Returns the row marked isDefault first; falls back to the first connected row.
 */
export async function getMeetingIntegrationForBusiness(
  businessId: string
): Promise<MeetingIntegrationConfig> {
  const db = getDb();
  const rows = await db
    .select()
    .from(businessIntegrations)
    .where(eq(businessIntegrations.businessId, businessId));

  await Promise.all(rows.map((row) => backfillEncryptedTokensIfNeeded(row)));

  if (rows.length === 0) return { provider: 'none' };

  const meetingProviders = new Set(['google', 'zoom', 'calendly']);
  const meetingRows = rows.filter((r) => meetingProviders.has(r.provider));
  if (meetingRows.length === 0) return { provider: 'none' };

  const defaultRow = meetingRows.find((r) => r.isDefault);
  const connectedRow = rows.find((r) => {
    if (!meetingProviders.has(r.provider)) return false;
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

export async function getSupportIntegrationForBusiness(
  businessId: string
): Promise<SupportIntegrationConfig> {
  const db = getDb();
  const rows = await db
    .select()
    .from(businessIntegrations)
    .where(eq(businessIntegrations.businessId, businessId));

  await Promise.all(rows.map((row) => backfillEncryptedTokensIfNeeded(row)));

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
