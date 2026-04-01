/**
 * business_skill_settings — per-business skill enablement and optional config.
 */
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses.js';

export const SKILL_NAMES = [
  'calculator',
  'datetime',
  'firecrawl',
  'lead_qualification',
  'meeting_scheduler',
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export const businessSkillSettings = pgTable(
  'business_skill_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    skillName: text('skill_name', { enum: SKILL_NAMES }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    config: text('config').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('bss_business_skill_unique').on(t.businessId, t.skillName)],
);

export type BusinessSkillSetting = typeof businessSkillSettings.$inferSelect;
export type NewBusinessSkillSetting = typeof businessSkillSettings.$inferInsert;
