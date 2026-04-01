import { Router, type Router as ExpressRouter } from 'express';
import { ChatController } from '../controllers/chatController';
import { chatRateLimiter } from '../middleware/rateLimit';

const router: ExpressRouter = Router();
const chatController = new ChatController();

/**
 * POST /api/agent/chat
 *
 * Main chat endpoint — runs the LangGraph agent and streams SSE events.
 *
 * Request body (JSON):
 *   { message: string; threadId?: string; publicToken?: string }
 *
 * Response:
 *   text/event-stream  →  series of StreamEvent JSON objects
 */
router.post('/chat', chatRateLimiter, chatController.handleChatStream);
router.post('/escalate', chatRateLimiter, chatController.handleManualEscalation);

export default router;
