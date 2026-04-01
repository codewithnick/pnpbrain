import { Router, type Router as ExpressRouter } from 'express';
import { BusinessController } from '../controllers/businessController';

const router: ExpressRouter = Router();
const controller = new BusinessController();

router.get('/me', controller.getMe);
router.put('/me', controller.updateMe);

export default router;
