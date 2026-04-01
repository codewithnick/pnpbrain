/**
 * User / auth types (business owners + internal roles).
 */

export type UserRole = 'super_admin' | 'business_owner' | 'viewer';

export interface GcfisUser {
  id: string;
  email: string;
  role: UserRole;
  businessId?: string;
  createdAt: string;
}
