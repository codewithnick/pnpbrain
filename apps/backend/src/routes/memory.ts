import { Router, type Router as ExpressRouter } from 'express';
import { MemoryController } from '../controllers/memoryController';

const router: ExpressRouter = Router();
const controller = new MemoryController();

router.get('/agent', controller.getAgentMemory);
router.delete('/agent/:id', controller.deleteAgentMemory);

router.get('/', controller.getMemory);
router.delete('/:id', controller.deleteMemory);

export default router;
