import { Router, type Router as ExpressRouter } from 'express';
import { SkillsController } from '../controllers/skillsController';

const router: ExpressRouter = Router();
const controller = new SkillsController();

/**
 * POST /api/skills/firecrawl
 */
router.post('/firecrawl', controller.runFirecrawl);

export default router;
