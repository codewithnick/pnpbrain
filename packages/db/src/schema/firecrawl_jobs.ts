/**
 * Firecrawl jobs — tracks background crawl/scrape jobs per business.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const firecrawlJobs = pgTable('firecrawl_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['queued', 'running', 'done', 'error'],
  })
    .notNull()
    .default('queued'),
  /** JSON array of requested URLs */
  urls: text('urls').notNull().default('[]'),
  /** Error message if status === 'error' */
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FirecrawlJob = typeof firecrawlJobs.$inferSelect;
export type NewFirecrawlJob = typeof firecrawlJobs.$inferInsert;
