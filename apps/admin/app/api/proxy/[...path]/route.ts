import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getBackendBaseUrl(): string {
  const configured =
    process.env['BACKEND_INTERNAL_URL']?.trim()
    || process.env['NEXT_PUBLIC_BACKEND_URL']?.trim()
    || 'http://localhost:3011';

  return configured.replace(/\/+$/, '');
}

async function proxyToBackend(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
): Promise<NextResponse> {
  try {
    const { path = [] } = await context.params;
    const targetUrl = new URL(`/${path.join('/')}`, `${getBackendBaseUrl()}/`);

    request.nextUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');

    const host = request.headers.get('host');
    if (host) {
      headers.set('x-forwarded-host', host);
    }

    const protocol = request.nextUrl.protocol.replace(':', '');
    if (protocol) {
      headers.set('x-forwarded-proto', protocol);
    }

    const body = ['GET', 'HEAD'].includes(request.method)
      ? null
      : await request.arrayBuffer();

    const requestInit: RequestInit = {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      ...(body ? { body } : {}),
    };

    const upstreamResponse = await fetch(targetUrl.toString(), requestInit);

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to reach backend API. Check BACKEND_INTERNAL_URL or NEXT_PUBLIC_BACKEND_URL.',
      },
      { status: 503 }
    );
  }
}

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const PATCH = proxyToBackend;
export const DELETE = proxyToBackend;
export const OPTIONS = proxyToBackend;
