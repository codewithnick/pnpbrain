import { Router, type Router as ExpressRouter } from 'express';
import { HealthController } from '../controllers/healthController';

const router: ExpressRouter = Router();
const controller = new HealthController();

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring and uptime verification.
 */
router.get('/', controller.handleHealth);

export default router;
