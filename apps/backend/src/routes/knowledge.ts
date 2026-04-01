import { Router, type Router as ExpressRouter } from 'express';
import { KnowledgeController } from '../controllers/knowledgeController';

const router: ExpressRouter = Router();
const controller = new KnowledgeController();

router.get('/', controller.list);
router.post('/', controller.upload.single('file'), controller.create);
router.get('/:id', controller.getById);
router.delete('/:id', controller.deleteById);

export default router;
