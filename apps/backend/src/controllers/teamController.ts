import { Request, Response } from 'express';
import { z } from 'zod';
import { requireBusinessAuth, requireSupabaseAuth } from '../middleware/auth';
import {
  acceptInvitation,
  assignableRoles,
  createInvitation,
  getInvitationByToken,
  getPendingInvitations,
  getTeamMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from '../lib/team';
import { getBusinessById } from '../lib/business';
import type { BusinessMemberRole } from '@gcfis/db/schema';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
});

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
});

function getAdminBaseUrl(): string {
  return process.env['ADMIN_BASE_URL'] ?? 'http://localhost:3010';
}

export class TeamController {
  /** GET /api/team/members */
  public readonly listMembers = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const members = await getTeamMembers(auth.businessId);
    return res.json({ ok: true, data: members });
  };

  /** GET /api/team/invitations */
  public readonly listInvitations = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const pending = await getPendingInvitations(auth.businessId);
    return res.json({ ok: true, data: pending });
  };

  /** POST /api/team/invite */
  public readonly invite = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const { email, role } = parsed.data;

    const allowed = assignableRoles(auth.role);
    if (!(allowed as string[]).includes(role)) {
      return res.status(403).json({
        ok: false,
        error: `Your role (${auth.role}) cannot assign the ${role} role`,
      });
    }

    const result = await createInvitation(
      auth.businessId,
      auth.userId,
      auth.role,
      email,
      role as BusinessMemberRole,
    );

    if (typeof result === 'string') {
      return res.status(400).json({ ok: false, error: result });
    }

    const acceptUrl = `${getAdminBaseUrl()}/invitations/accept?token=${result.token}`;

    return res.status(201).json({
      ok: true,
      data: {
        invitation: result,
        acceptUrl,
      },
    });
  };

  /** PUT /api/team/members/:memberId/role */
  public readonly updateRole = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const memberId = req.params['memberId'] ?? '';
    const result = await updateMemberRole(
      auth.businessId,
      auth.role,
      memberId,
      parsed.data.role as BusinessMemberRole,
    );

    if (typeof result === 'string') {
      return res.status(400).json({ ok: false, error: result });
    }

    return res.json({ ok: true, data: result });
  };

  /** DELETE /api/team/members/:memberId */
  public readonly removeMember = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const memberId = req.params['memberId'] ?? '';
    const result = await removeMember(auth.businessId, auth.role, memberId);

    if (typeof result === 'string') {
      return res.status(400).json({ ok: false, error: result });
    }

    return res.json({ ok: true });
  };

  /** DELETE /api/team/invitations/:invitationId */
  public readonly revokeInvitation = async (req: Request, res: Response) => {
    const auth = await requireBusinessAuth(req, res, 'admin');
    if (!auth) return;

    const invitationId = req.params['invitationId'] ?? '';
    const result = await revokeInvitation(auth.businessId, auth.role, invitationId);

    if (typeof result === 'string') {
      return res.status(400).json({ ok: false, error: result });
    }

    return res.json({ ok: true });
  };

  /**
   * GET /api/team/invitations/preview?token=...
   * Public endpoint — lets the invited user preview invite details before
   * accepting.  No auth required.
   */
  public readonly previewInvitation = async (req: Request, res: Response) => {
    const token = String(req.query['token'] ?? '');
    if (!token) {
      return res.status(400).json({ ok: false, error: 'token is required' });
    }

    const invite = await getInvitationByToken(token);
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return res.status(404).json({ ok: false, error: 'Invitation not found or expired' });
    }

    const business = await getBusinessById(invite.businessId);

    return res.json({
      ok: true,
      data: {
        id: invite.id,
        businessName: business?.name ?? 'Unknown',
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
    });
  };

  /**
   * POST /api/team/invitations/accept
   * Authenticated endpoint — the invited user accepts the invite.
   */
  public readonly acceptInvitation = async (req: Request, res: Response) => {
    const supabaseAuth = await requireSupabaseAuth(req, res);
    if (!supabaseAuth) return;

    const token = String(req.body?.token ?? '');
    if (!token) {
      return res.status(400).json({ ok: false, error: 'token is required' });
    }

    const result = await acceptInvitation(token, supabaseAuth.userId, supabaseAuth.email);

    if (typeof result === 'string') {
      return res.status(400).json({ ok: false, error: result });
    }

    return res.status(201).json({ ok: true, data: result });
  };
}
