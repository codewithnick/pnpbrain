import { Router, type Router as ExpressRouter } from 'express';
import { PublicController } from '../controllers/publicController';

const router: ExpressRouter = Router();
const controller = new PublicController();

router.get('/:slug', controller.getBusinessBySlug);

export default router;
