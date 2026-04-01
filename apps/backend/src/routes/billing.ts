import { Router, type Router as ExpressRouter } from 'express';
import { BillingController } from '../controllers/billingController';

const router: ExpressRouter = Router();
const webhookRouter: ExpressRouter = Router();
const controller = new BillingController();

router.get('/status', controller.getStatus);
router.post('/checkout', controller.checkout);
router.post('/portal', controller.portal);
webhookRouter.post('/', controller.webhook);

export { webhookRouter };
export default router;
