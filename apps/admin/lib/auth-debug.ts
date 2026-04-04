const AUTH_DEBUG_PREFIX = '[admin-auth]';

type AuthDebugDetails = Record<string, unknown>;

export function maskEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim().toLowerCase();
  const [localPart = '', ...domainParts] = trimmedValue.split('@');
  const domain = domainParts.join('@');

  if (!localPart || !domain) {
    return `${trimmedValue.slice(0, 2)}***`;
  }

  return `${localPart.slice(0, 2) || '*'}***@${domain}`;
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: error,
  };
}

function withTimestamp(details: AuthDebugDetails): AuthDebugDetails {
  return {
    at: new Date().toISOString(),
    ...details,
  };
}

export function logAuthInfo(event: string, details: AuthDebugDetails = {}): void {
  console.info(`${AUTH_DEBUG_PREFIX} ${event}`, withTimestamp(details));
}

export function logAuthWarn(event: string, details: AuthDebugDetails = {}): void {
  console.warn(`${AUTH_DEBUG_PREFIX} ${event}`, withTimestamp(details));
}

export function logAuthError(event: string, error: unknown, details: AuthDebugDetails = {}): void {
  console.error(`${AUTH_DEBUG_PREFIX} ${event}`, {
    ...withTimestamp(details),
    error: normalizeError(error),
  });
}
