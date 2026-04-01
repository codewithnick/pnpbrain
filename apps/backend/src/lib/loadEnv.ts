import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Loads env files for the Express backend in a predictable order.
 * Earlier files are base defaults and later files can override them.
 */
export function loadBackendEnv(): void {
  const cwd = process.cwd();

  const candidates = [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '../../.env'),
    path.resolve(cwd, '../../.env.local'),
  ];

  for (const envPath of candidates) {
    loadDotenv({ path: envPath, override: false });
  }

  const requiredAtRuntime = [
    'DATABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = requiredAtRuntime.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(
      `[backend] Missing required env vars: ${missing.join(', ')}. Auth or data endpoints may return 500.`
    );
  }

  const looksLikePlaceholder = (value?: string): boolean => {
    if (!value) return true;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return true;
    return ['your-', 'replace-', 'changeme', 'example'].some((prefix) =>
      normalized.startsWith(prefix)
    );
  };

  if (looksLikePlaceholder(process.env['SUPABASE_SERVICE_ROLE_KEY'])) {
    console.warn(
      '[backend] SUPABASE_SERVICE_ROLE_KEY looks like a placeholder. Auth will fall back to NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY when possible.'
    );
  }
}
