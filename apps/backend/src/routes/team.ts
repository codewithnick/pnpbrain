import { Router, type Router as ExpressRouter } from 'express';
import { TeamController } from '../controllers/teamController';

const router: ExpressRouter = Router();
const controller = new TeamController();

// Members
router.get('/members', controller.listMembers);
router.put('/members/:memberId/role', controller.updateRole);
router.delete('/members/:memberId', controller.removeMember);

// Invitations
router.get('/invitations', controller.listInvitations);
router.post('/invite', controller.invite);
router.delete('/invitations/:invitationId', controller.revokeInvitation);

// Public preview + accept (no RBAC guard — auth handled inside controller)
router.get('/invitations/preview', controller.previewInvitation);
router.post('/invitations/accept', controller.acceptInvitation);

export default router;
