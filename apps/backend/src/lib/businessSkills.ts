import { getDb } from '@gcfis/db/client';
import {
  businessMeetingIntegrations,
  businessSkillSettings,
  MEETING_PROVIDERS,
  SKILL_NAMES,
} from '@gcfis/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

const SKILL_SET = new Set<string>(SKILL_NAMES);
type SkillName = (typeof SKILL_NAMES)[number];

export interface MeetingIntegrationConfig {
  provider: 'none' | 'google' | 'zoom' | 'calendly';
  timezone?: string;
  calendarId?: string;
  calendlySchedulingUrl?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleAccessTokenExpiresAt?: string;
  zoomAccessToken?: string;
  zoomRefreshToken?: string;
  zoomAccessTokenExpiresAt?: string;
}

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

export async function setEnabledSkillsForBusiness(businessId: string, skills: string[]): Promise<void> {
  const sanitizedSkills: SkillName[] = [...new Set(skills)]
    .map((value) => parseSkillName(value))
    .filter((value): value is SkillName => value !== null);

  const db = getDb();

  const existingRows = await db
    .select({ id: businessSkillSettings.id })
    .from(businessSkillSettings)
    .where(eq(businessSkillSettings.businessId, businessId));

  if (existingRows.length === 0) {
    await db.insert(businessSkillSettings).values(
      SKILL_NAMES.map((skillName) => ({
        businessId,
        skillName,
        enabled: false,
      }))
    );
  }

  await db
    .update(businessSkillSettings)
    .set({ enabled: false, updatedAt: sql`now()` })
    .where(eq(businessSkillSettings.businessId, businessId));

  if (sanitizedSkills.length === 0) {
    return;
  }

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

function toMeetingConfig(
  row: typeof businessMeetingIntegrations.$inferSelect | null | undefined
): MeetingIntegrationConfig {
  if (!row) {
    return { provider: 'none' };
  }

  const provider = MEETING_PROVIDERS.includes(row.provider)
    ? row.provider
    : 'none';

  return {
    provider,
    ...(row.timezone ? { timezone: row.timezone } : {}),
    ...(row.calendarId ? { calendarId: row.calendarId } : {}),
    ...(row.calendlySchedulingUrl ? { calendlySchedulingUrl: row.calendlySchedulingUrl } : {}),
    ...(row.googleAccessToken ? { googleAccessToken: row.googleAccessToken } : {}),
    ...(row.googleRefreshToken ? { googleRefreshToken: row.googleRefreshToken } : {}),
    ...(row.googleAccessTokenExpiresAt
      ? { googleAccessTokenExpiresAt: row.googleAccessTokenExpiresAt.toISOString() }
      : {}),
    ...(row.zoomAccessToken ? { zoomAccessToken: row.zoomAccessToken } : {}),
    ...(row.zoomRefreshToken ? { zoomRefreshToken: row.zoomRefreshToken } : {}),
    ...(row.zoomAccessTokenExpiresAt
      ? { zoomAccessTokenExpiresAt: row.zoomAccessTokenExpiresAt.toISOString() }
      : {}),
  };
}

export async function getMeetingIntegrationForBusiness(businessId: string): Promise<MeetingIntegrationConfig> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(businessMeetingIntegrations)
    .where(eq(businessMeetingIntegrations.businessId, businessId))
    .limit(1);

  return toMeetingConfig(row);
}

export async function updateMeetingIntegrationForBusiness(
  businessId: string,
  patch: Partial<MeetingIntegrationConfig>
): Promise<MeetingIntegrationConfig> {
  const db = getDb();
  let [current] = await db
    .select()
    .from(businessMeetingIntegrations)
    .where(eq(businessMeetingIntegrations.businessId, businessId))
    .limit(1);

  if (!current) {
    const [created] = await db
      .insert(businessMeetingIntegrations)
      .values({ businessId, provider: 'none' })
      .returning();
    current = created;
  }

  const provider = patch.provider && MEETING_PROVIDERS.includes(patch.provider)
    ? patch.provider
    : current?.provider ?? 'none';

  const normalizedGoogleAccessToken = patch.googleAccessToken === ''
    ? null
    : (patch.googleAccessToken ?? current?.googleAccessToken ?? null);
  const normalizedGoogleRefreshToken = patch.googleRefreshToken === ''
    ? null
    : (patch.googleRefreshToken ?? current?.googleRefreshToken ?? null);
  const normalizedZoomAccessToken = patch.zoomAccessToken === ''
    ? null
    : (patch.zoomAccessToken ?? current?.zoomAccessToken ?? null);
  const normalizedZoomRefreshToken = patch.zoomRefreshToken === ''
    ? null
    : (patch.zoomRefreshToken ?? current?.zoomRefreshToken ?? null);

  const [updated] = await db
    .update(businessMeetingIntegrations)
    .set({
      provider,
      timezone: patch.timezone ?? current?.timezone ?? null,
      calendarId: patch.calendarId ?? current?.calendarId ?? null,
      calendlySchedulingUrl: patch.calendlySchedulingUrl ?? current?.calendlySchedulingUrl ?? null,
      googleAccessToken: normalizedGoogleAccessToken,
      googleRefreshToken: normalizedGoogleRefreshToken,
      googleAccessTokenExpiresAt: patch.googleAccessTokenExpiresAt
        ? new Date(patch.googleAccessTokenExpiresAt)
        : current?.googleAccessTokenExpiresAt ?? null,
      zoomAccessToken: normalizedZoomAccessToken,
      zoomRefreshToken: normalizedZoomRefreshToken,
      zoomAccessTokenExpiresAt: patch.zoomAccessTokenExpiresAt
        ? new Date(patch.zoomAccessTokenExpiresAt)
        : current?.zoomAccessTokenExpiresAt ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(businessMeetingIntegrations.businessId, businessId))
    .returning();

  return toMeetingConfig(updated ?? current);
}
