/**
 * Backend root page — directs developers to the API docs.
 * Not exposed to end users.
 */
export default function BackendRoot() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>GCFIS Backend API</h1>
      <p>This service exposes API routes only. There is no UI here.</p>
      <h2>Available routes</h2>
      <ul>
        <li>POST /api/agent/chat — streaming chat (SSE)</li>
        <li>GET  /api/knowledge  — list knowledge docs</li>
        <li>POST /api/knowledge  — create knowledge doc</li>
        <li>GET  /api/memory     — list memory facts</li>
        <li>POST /api/skills/firecrawl — trigger crawl</li>
        <li>GET  /api/health     — health check</li>
      </ul>
    </main>
  );
}
