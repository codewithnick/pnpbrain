import { Router, type Router as ExpressRouter } from 'express';
import { ChatController } from '../controllers/chatController';
import { chatRateLimiter } from '../middleware/rateLimit';

const router: ExpressRouter = Router();
const chatController = new ChatController();

/**
 * Chat transport endpoints:
 * - POST /api/agent/chat      -> SSE streaming chat (frontend-agnostic)
 * - WS   /ws/agent            -> WebSocket streaming chat
 */
router.post('/chat', chatRateLimiter, chatController.handleChatStream);
router.post('/escalate', chatRateLimiter, chatController.handleManualEscalation);

export default router;
