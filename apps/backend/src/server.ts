import express from 'express';
import { corsMwfn } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import agentRoutes from './routes/agent';
import authRoutes from './routes/auth';
import billingRoutes, { webhookRouter } from './routes/billing';
import businessRoutes from './routes/business';
import conversationsRoutes from './routes/conversations';
import dashboardRoutes from './routes/dashboard';
import healthRoutes from './routes/health';
import knowledgeRoutes from './routes/knowledge';
import memoryRoutes from './routes/memory';
import publicRoutes from './routes/public';
import skillsRoutes from './routes/skills';

const app: express.Express = express();
const PORT = process.env['PORT'] ?? 3001;

// ─── Middleware ────────────────────────────────────────────────────────────

// Stripe webhooks require raw request bytes (must run before JSON parser)
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookRouter);

// Parse JSON bodies
app.use(express.json());

// CORS
app.use(corsMwfn);

// ─── Routes ────────────────────────────────────────────────────────────────

// Health check
app.use('/api/health', healthRoutes);

// Agent endpoints
app.use('/api/agent', agentRoutes);

// Authentication endpoints
app.use('/api/auth', authRoutes);

// Business profile endpoints
app.use('/api/business', businessRoutes);

// Dashboard stats endpoints
app.use('/api/dashboard', dashboardRoutes);

// Conversation history endpoints
app.use('/api/conversations', conversationsRoutes);

// Knowledge base endpoints
app.use('/api/knowledge', knowledgeRoutes);

// Billing endpoints (except webhook)
app.use('/api/billing', billingRoutes);

// Public business config endpoint
app.use('/api/public', publicRoutes);

// Memory operations
app.use('/api/memory', memoryRoutes);

// Skills endpoints
app.use('/api/skills', skillsRoutes);

// ─── Error Handler ─────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start Server ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[backend] Express server running on http://localhost:${PORT}`);
});

export default app;
