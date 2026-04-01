/**
 * invitations — pending email invitations to join a business.
 * A row is created by an owner/admin and consumed when the invited user
 * clicks the acceptance link and authenticates.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

/** Roles that can be assigned via invitation (owners are not created via invite). */
export const INVITATION_ROLES = ['admin', 'member', 'viewer'] as const;
export type InvitationRole = (typeof INVITATION_ROLES)[number];

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The business this invitation targets. */
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  /** Email address of the person being invited. */
  email: text('email').notNull(),
  /** Role that will be assigned upon acceptance. */
  role: text('role', { enum: INVITATION_ROLES }).notNull(),
  /**
   * Cryptographically random token embedded in the invite link.
   * Unique across all invitations.
   */
  token: text('token').notNull().unique(),
  /** userId of the person who sent the invitation. */
  invitedBy: text('invited_by').notNull(),
  /** Invitation expires after 7 days by default. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Set when the invitation is accepted; null = still pending. */
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
