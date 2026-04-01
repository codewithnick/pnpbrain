import { Router, type Router as ExpressRouter } from 'express';
import { MemoryController } from '../controllers/memoryController';

const router: ExpressRouter = Router();
const controller = new MemoryController();

/**
 * GET /api/memory
 *
 * Placeholder for memory operations endpoint.
 * This could be extended for memory retrieval, updates, etc.
 */
router.get('/', controller.getMemory);

export default router;
