import { Router, type Router as ExpressRouter } from 'express';
import { BusinessController } from '../controllers/businessController';

const router: ExpressRouter = Router();
const controller = new BusinessController();

router.get('/me', controller.getMe);
router.put('/me', controller.updateMe);
router.post('/me/api-key/rotate', controller.rotateApiKey);
router.post('/me/integrations/google/connect', controller.getGoogleConnectUrl);
router.post('/me/integrations/zoom/connect', controller.getZoomConnectUrl);
router.post('/me/integrations/:provider/disconnect', controller.disconnectMeetingProvider);
router.patch('/me/integrations/:provider', controller.updateIntegrationConfig);
router.get('/integrations/google/callback', controller.googleCallback);
router.get('/integrations/zoom/callback', controller.zoomCallback);

export default router;
