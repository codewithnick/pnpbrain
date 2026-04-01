import { Router, type Router as ExpressRouter } from 'express';
import { ChatController } from '../controllers/chatController';

const router: ExpressRouter = Router();
const chatController = new ChatController();

/**
 * POST /api/agent/chat
 *
 * Main chat endpoint — runs the LangGraph agent and streams SSE events.
 *
 * Request body (JSON):
 *   { message: string; threadId?: string; businessId: string }
 *
 * Response:
 *   text/event-stream  →  series of StreamEvent JSON objects
 */
router.post('/chat', chatController.handleChatStream);

export default router;
