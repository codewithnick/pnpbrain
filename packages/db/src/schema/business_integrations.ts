/**
 * business_integrations — one row per provider per business.
 *
 * Each row holds OAuth tokens and a configJson blob for one integration.
 * The unique index is on (business_id, provider) so a business can connect
 * multiple providers simultaneously (Google + Zoom + Calendly, etc.).
 * Adding a new provider in the future requires no schema migration — just
 * insert a row with the new provider string.
 */
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const businessIntegrations = pgTable(
  'business_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** Provider slug: 'google' | 'zoom' | 'calendly' | future values. No DB enum so new providers need no migration. */
    provider: text('provider').notNull(),
    /** When true the agent picks this provider for meeting booking. Only one row per business should be true. */
    isDefault: boolean('is_default').notNull().default(false),
    /** OAuth access token (or API key for non-OAuth providers), encrypted in app layer before persistence. */
    accessToken: text('access_token'),
    /** OAuth refresh token, encrypted in app layer before persistence. */
    refreshToken: text('refresh_token'),
    /** Expiry timestamp for the access token. */
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    /** Provider-specific JSON config, e.g. { "calendarId": "primary", "timezone": "UTC", "schedulingUrl": "..." } */
    configJson: text('config_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('bi_business_provider_unique').on(t.businessId, t.provider)],
);

export type BusinessIntegration = typeof businessIntegrations.$inferSelect;
export type NewBusinessIntegration = typeof businessIntegrations.$inferInsert;
