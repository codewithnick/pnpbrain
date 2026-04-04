/**
 * User / auth types — covers both system-level roles and per-business RBAC roles.
 */

/** Legacy system-level role (kept for super_admin tooling). */
export type UserRole = 'super_admin' | 'business_owner' | 'viewer';

/**
 * Per-business RBAC role.
 *
 * owner  — full control; billing; can assign any role; cannot be removed
 * admin  — manage settings, knowledge, conversations; invite member/viewer
 * member — manage knowledge and conversations; read-only settings
 * viewer — read-only access to dashboard and conversations
 */
export type BusinessMemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface PnpbrainUser {
  id: string;
  email: string;
  role: UserRole;
  businessId?: string;
  businessRole?: BusinessMemberRole;
  createdAt: string;
}
