import { Router, type Router as ExpressRouter } from 'express';
import { AgentsController } from '../controllers/agentsController';
import { CustomSkillsController } from '../controllers/customSkillsController';

const router: ExpressRouter = Router();
const controller = new AgentsController();
const customSkillsController = new CustomSkillsController();

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:agentId', controller.update);
router.patch('/:agentId/archive', controller.archive);
router.delete('/:agentId', controller.remove);
router.get('/:agentId/custom-skills', customSkillsController.list);
router.post('/:agentId/custom-skills/test', customSkillsController.testWebhook);
router.post('/:agentId/custom-skills', customSkillsController.create);
router.patch('/:agentId/custom-skills/:skillId', customSkillsController.update);
router.delete('/:agentId/custom-skills/:skillId', customSkillsController.remove);

export default router;
