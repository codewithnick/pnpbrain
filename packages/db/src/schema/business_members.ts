/**
 * business_members — links Supabase users to a business with a specific role.
 * One row per (business, user) pair.  Owners are inserted automatically when
 * a business is created via the auth controller.
 */
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const BUSINESS_MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type BusinessMemberRole = (typeof BUSINESS_MEMBER_ROLES)[number];

/** Numeric rank used to compare roles (higher = more privilege). */
export const ROLE_RANK: Record<BusinessMemberRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/** Returns true if `role` meets the `required` minimum. */
export function hasMinRole(role: BusinessMemberRole, required: BusinessMemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export const businessMembers = pgTable(
  'business_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The business this membership belongs to. */
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** Supabase Auth user ID. */
    userId: text('user_id').notNull(),
    /** User email — stored for display; sourced from Supabase JWT on creation. */
    email: text('email').notNull().default(''),
    /** RBAC role within this business. */
    role: text('role', { enum: BUSINESS_MEMBER_ROLES }).notNull(),
    /** userId of the person who invited this member; null for the original owner. */
    invitedBy: text('invited_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('bm_business_user_unique').on(t.businessId, t.userId)],
);

export type BusinessMember = typeof businessMembers.$inferSelect;
export type NewBusinessMember = typeof businessMembers.$inferInsert;
