/**
 * Team management service.
 *
 * Handles:
 *  - listing/modifying business_members
 *  - creating and accepting invitations
 *  - role hierarchy enforcement (owner > admin > member > viewer)
 */
import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@pnpbrain/db/client';
import {
  businessMembers,
  invitations,
  ROLE_RANK,
  type BusinessMember,
  type BusinessMemberRole,
  type Invitation,
} from '@pnpbrain/db/schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Returns true if `actorRole` has enough privilege to manage `targetRole`. */
function canManageRole(actorRole: BusinessMemberRole, targetRole: BusinessMemberRole): boolean {
  // Can only manage roles strictly below your own
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

/** Roles that an actor with `actorRole` is allowed to assign. */
export function assignableRoles(actorRole: BusinessMemberRole): BusinessMemberRole[] {
  return (['admin', 'member', 'viewer'] as BusinessMemberRole[]).filter(
    (r) => ROLE_RANK[actorRole] > ROLE_RANK[r],
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function getTeamMembers(businessId: string): Promise<BusinessMember[]> {
  const db = getDb();
  return db
    .select()
    .from(businessMembers)
    .where(eq(businessMembers.businessId, businessId))
    .orderBy(businessMembers.createdAt);
}

export async function getMemberById(
  businessId: string,
  memberId: string,
): Promise<BusinessMember | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.id, memberId)))
    .limit(1);
  return row ?? null;
}

/**
 * Updates a member's role.
 *
 * Enforces: actor must outrank both the target's *current* and *new* role,
 * and the owner cannot be demoted.
 *
 * @returns Updated member, or an error string.
 */
export async function updateMemberRole(
  businessId: string,
  actorRole: BusinessMemberRole,
  memberId: string,
  newRole: BusinessMemberRole,
): Promise<BusinessMember | string> {
  const db = getDb();
  const target = await getMemberById(businessId, memberId);
  if (!target) return 'Member not found';
  if (target.role === 'owner') return 'Owner role cannot be changed';
  if (!canManageRole(actorRole, target.role as BusinessMemberRole)) {
    return 'Insufficient permissions to modify this member';
  }
  if (!canManageRole(actorRole, newRole)) {
    return 'Cannot assign a role equal to or higher than your own';
  }

  const [updated] = await db
    .update(businessMembers)
    .set({ role: newRole, updatedAt: new Date() })
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.id, memberId)))
    .returning();

  return updated ?? 'Update failed';
}

/**
 * Removes a team member.
 *
 * Enforces: actor must outrank the target; owner cannot be removed.
 *
 * @returns true on success, or an error string.
 */
export async function removeMember(
  businessId: string,
  actorRole: BusinessMemberRole,
  memberId: string,
): Promise<true | string> {
  const db = getDb();
  const target = await getMemberById(businessId, memberId);
  if (!target) return 'Member not found';
  if (target.role === 'owner') return 'The owner cannot be removed';
  if (!canManageRole(actorRole, target.role as BusinessMemberRole)) {
    return 'Insufficient permissions to remove this member';
  }

  await db
    .delete(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.id, memberId)));

  return true;
}

// ─── Invitations ──────────────────────────────────────────────────────────────

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Creates (or replaces a pending) invitation for `email` in `businessId`.
 *
 * Enforces: actor must be able to assign the requested role.
 *
 * @returns The invitation row, or an error string.
 */
export async function createInvitation(
  businessId: string,
  actorUserId: string,
  actorRole: BusinessMemberRole,
  email: string,
  role: BusinessMemberRole,
): Promise<Invitation | string> {
  if (!canManageRole(actorRole, role)) {
    return 'Cannot invite someone to a role equal to or higher than your own';
  }

  const db = getDb();

  // Replace any existing pending invite for this email in this business
  await db
    .delete(invitations)
    .where(
      and(
        eq(invitations.businessId, businessId),
        eq(invitations.email, email.toLowerCase()),
        isNull(invitations.acceptedAt),
      ),
    );

  const [invite] = await db
    .insert(invitations)
    .values({
      businessId,
      email: email.toLowerCase(),
      role: role as 'admin' | 'member' | 'viewer',
      token: generateToken(),
      invitedBy: actorUserId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();

  return invite ?? 'Failed to create invitation';
}

export async function getPendingInvitations(businessId: string): Promise<Invitation[]> {
  const db = getDb();
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.businessId, businessId), isNull(invitations.acceptedAt)))
    .orderBy(invitations.createdAt);
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);
  return row ?? null;
}

/**
 * Accepts an invitation: creates a `business_members` row and marks the
 * invitation as accepted.
 *
 * @returns The new BusinessMember row, or an error string.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
  email: string,
): Promise<BusinessMember | string> {
  const invite = await getInvitationByToken(token);
  if (!invite) return 'Invitation not found';
  if (invite.acceptedAt) return 'Invitation has already been used';
  if (invite.expiresAt < new Date()) return 'Invitation has expired';

  const db = getDb();

  // Check if user is already a member of this business
  const [existing] = await db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, invite.businessId), eq(businessMembers.userId, userId)))
    .limit(1);

  if (existing) return 'You are already a member of this business';

  const [member] = await db
    .insert(businessMembers)
    .values({
      businessId: invite.businessId,
      userId,
      email: email || invite.email,
      role: invite.role as BusinessMemberRole,
      invitedBy: invite.invitedBy,
    })
    .returning();

  if (!member) return 'Failed to create membership';

  await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(invitations.id, invite.id));

  return member;
}

/**
 * Revokes a pending invitation. Only admin+ roles can revoke.
 * @returns true on success, or an error string.
 */
export async function revokeInvitation(
  businessId: string,
  actorRole: BusinessMemberRole,
  invitationId: string,
): Promise<true | string> {
  if (ROLE_RANK[actorRole] < ROLE_RANK['admin']) {
    return 'Insufficient permissions';
  }

  const db = getDb();
  const [invite] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.businessId, businessId)))
    .limit(1);

  if (!invite) return 'Invitation not found';
  if (invite.acceptedAt) return 'Invitation has already been accepted';

  await db.delete(invitations).where(eq(invitations.id, invitationId));
  return true;
}
