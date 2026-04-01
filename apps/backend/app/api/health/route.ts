/**
 * GET /api/health — simple health check endpoint.
 * Used by Docker/Kubernetes liveness probes and monitoring.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'gcfis-backend',
    version: process.env['npm_package_version'] ?? '0.0.1',
    timestamp: new Date().toISOString(),
  });
}
