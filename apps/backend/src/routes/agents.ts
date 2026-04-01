import { Router, type Router as ExpressRouter } from 'express';
import { AgentsController } from '../controllers/agentsController';

const router: ExpressRouter = Router();
const controller = new AgentsController();

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:agentId', controller.update);
router.patch('/:agentId/archive', controller.archive);
router.delete('/:agentId', controller.remove);

export default router;
