import { Router, type Router as ExpressRouter } from 'express';
import { ConversationsController } from '../controllers/conversationsController';

const router: ExpressRouter = Router();
const controller = new ConversationsController();

router.get('/', controller.list);
router.get('/:id', controller.getById);

export default router;
