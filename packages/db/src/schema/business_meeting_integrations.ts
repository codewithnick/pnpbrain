/**
 * business_meeting_integrations — per-business meeting provider config and OAuth tokens.
 */
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses.js';

export const MEETING_PROVIDERS = ['none', 'google', 'zoom', 'calendly'] as const;
export type MeetingProvider = (typeof MEETING_PROVIDERS)[number];

export const businessMeetingIntegrations = pgTable(
  'business_meeting_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: MEETING_PROVIDERS }).notNull().default('none'),
    timezone: text('timezone'),
    calendarId: text('calendar_id'),
    calendlySchedulingUrl: text('calendly_scheduling_url'),
    googleAccessToken: text('google_access_token'),
    googleRefreshToken: text('google_refresh_token'),
    googleAccessTokenExpiresAt: timestamp('google_access_token_expires_at', { withTimezone: true }),
    zoomAccessToken: text('zoom_access_token'),
    zoomRefreshToken: text('zoom_refresh_token'),
    zoomAccessTokenExpiresAt: timestamp('zoom_access_token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('bmi_business_unique').on(t.businessId)],
);

export type BusinessMeetingIntegration = typeof businessMeetingIntegrations.$inferSelect;
export type NewBusinessMeetingIntegration = typeof businessMeetingIntegrations.$inferInsert;
