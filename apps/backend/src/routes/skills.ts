import { Router, type Router as ExpressRouter } from 'express';
import { SkillsController } from '../controllers/skillsController';
import { firecrawlRateLimiter } from '../middleware/rateLimit';

const router: ExpressRouter = Router();
const controller = new SkillsController();

/**
 * POST /api/skills/firecrawl
 */
router.post('/firecrawl', firecrawlRateLimiter, controller.runFirecrawl);

export default router;
