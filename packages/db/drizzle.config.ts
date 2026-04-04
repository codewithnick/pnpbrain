import { defineConfig } from 'drizzle-kit';

function encodeCredential(value: string) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function normalizeDatabaseUrl(rawUrl: string) {
  const schemeIndex = rawUrl.indexOf('://');
  if (schemeIndex === -1) return rawUrl;

  const protocol = rawUrl.slice(0, schemeIndex + 3);
  const remainder = rawUrl.slice(schemeIndex + 3);
  const atIndex = remainder.lastIndexOf('@');
  if (atIndex === -1) return rawUrl;

  const credentials = remainder.slice(0, atIndex);
  const hostAndPath = remainder.slice(atIndex + 1);
  const separatorIndex = credentials.indexOf(':');
  if (separatorIndex === -1) return rawUrl;

  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);

  return `${protocol}${encodeCredential(username)}:${encodeCredential(password)}@${hostAndPath}`;
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getDatabaseUrl() {
  const rawUrl = stripWrappingQuotes(process.env['DATABASE_URL']?.trim() ?? '');

  if (!rawUrl) {
    return '';
  }

  const normalizedUrl = URL.canParse(rawUrl) ? rawUrl : normalizeDatabaseUrl(rawUrl);
  if (!URL.canParse(normalizedUrl)) {
    throw new TypeError('DATABASE_URL is not a valid PostgreSQL connection string');
  }

  const url = new URL(normalizedUrl);
  url.searchParams.delete('sslmode');
  return url.toString();
}

function getDatabaseSsl() {
  const rawUrl = stripWrappingQuotes(process.env['DATABASE_URL']?.trim() ?? '');
  if (!rawUrl) return undefined;

  const normalizedUrl = URL.canParse(rawUrl) ? rawUrl : normalizeDatabaseUrl(rawUrl);
  if (!URL.canParse(normalizedUrl)) {
    return 'require';
  }

  const url = new URL(normalizedUrl);
  const sslMode = url.searchParams.get('sslmode');

  if (sslMode === 'disable' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return undefined;
  }

  if (sslMode === 'allow' || sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-full') {
    return sslMode;
  }

  return 'require';
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
    ssl: getDatabaseSsl(),
  },
  verbose: true,
  strict: true,
});
