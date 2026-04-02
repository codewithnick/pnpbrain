import { Router, type Router as ExpressRouter } from 'express';
import { DashboardController } from '../controllers/dashboardController';

const router: ExpressRouter = Router();
const controller = new DashboardController();

router.get('/stats', controller.getStats);
router.get('/usage', controller.getUsage);
router.get('/trends', controller.getTrends);

export default router;
