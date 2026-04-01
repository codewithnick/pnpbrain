/**
 * business_credit_ledger — immutable credit transaction history.
 */
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const businessCreditLedger = pgTable('business_credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  reason: text('reason', {
    enum: ['signup_bonus', 'top_up', 'usage_debit', 'manual_adjustment', 'refund'],
  })
    .notNull(),
  referenceId: text('reference_id'),
  metadata: jsonb('metadata'),
  createdByUserId: text('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BusinessCreditLedger = typeof businessCreditLedger.$inferSelect;
export type NewBusinessCreditLedger = typeof businessCreditLedger.$inferInsert;
