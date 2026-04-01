import { Router, type Router as ExpressRouter } from 'express';
import { AuthController } from '../controllers/authController';

const router: ExpressRouter = Router();
const controller = new AuthController();

router.post('/register', controller.register);

export default router;
