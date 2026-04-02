import express from 'express';
import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadBackendEnv } from './lib/loadEnv';
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
import agentsRoutes from './routes/agents';
import skillsRoutes from './routes/skills';
import teamRoutes from './routes/team';
import { mcpRateLimiter } from './middleware/rateLimit';
import { createMcpServer } from './mcp/server';
import { getAgentByApiKey } from './lib/agents';
import { getBusinessById } from './lib/business';
import { createChatWebSocketServer } from './realtime/chatWebSocketServer';

loadBackendEnv();

const app: express.Express = express();
const PORT = process.env['PORT'] ?? 3011;

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

// Team management endpoints
app.use('/api/team', teamRoutes);

// Agent management endpoints
app.use('/api/agents', agentsRoutes);

// ─── MCP Server ────────────────────────────────────────────────────────────
// Stateless Streamable HTTP transport — one server instance per request.
// Authenticate with: x-api-key: <your agent API key>

app.post('/mcp', mcpRateLimiter, express.json(), async (req: express.Request, res: express.Response) => {
  const apiKey = req.header('x-api-key');
  if (!apiKey) {
    res.status(401).json({ error: 'Missing x-api-key header. Provide your agent API key.' });
    return;
  }

  const matchedAgent = await getAgentByApiKey(apiKey);
  const business = matchedAgent ? await getBusinessById(matchedAgent.businessId) : null;
  const agent = matchedAgent;

  if (!business || !agent) {
    res.status(401).json({ error: 'Invalid API key.' });
    return;
  }

  // Stateless transport — omit sessionIdGenerator for stateless mode (no session persistence)
  // enableJsonResponse returns a direct JSON response instead of opening an SSE stream,
  // which is simpler for tool-calling MCP clients.
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createMcpServer({ business, agent });

  res.on('close', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    server.close().catch((err: unknown) => console.error('[mcp] server close error:', err));
  });

  // The SDK's Transport interface uses optional `onclose` but our strict tsconfig flags
  // the union type as incompatible — force-cast to satisfy exactOptionalPropertyTypes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await server.connect(transport as any);
  await transport.handleRequest(req, res, req.body);
});

// MCP: SSE upgrade for clients that open a persistent GET stream
app.get('/mcp', (req: express.Request, res: express.Response) => {
  res.status(405).json({
    error: 'Use POST /mcp with a JSON-RPC body. See https://modelcontextprotocol.io/docs/concepts/transports',
  });
});

// ─── Error Handler ─────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start Server ──────────────────────────────────────────────────────────

const httpServer = createServer(app);
const chatWss = createChatWebSocketServer({ path: '/ws/agent' });

httpServer.on('upgrade', (req, socket, head) => {
  if (!chatWss.shouldHandle(req)) {
    socket.destroy();
    return;
  }

  chatWss.handleUpgrade(req, socket, head, (ws) => {
    chatWss.emit('connection', ws, req);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[backend] Express server running on http://localhost:${PORT}`);
  console.log(`[backend] WebSocket chat endpoint running on ws://localhost:${PORT}/ws/agent`);
});

export default app;
