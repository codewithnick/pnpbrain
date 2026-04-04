import postgres from 'postgres';

function encodeCredential(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeDatabaseUrl(rawUrl) {
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

function getDatabaseConfig() {
  const rawUrl = stripWrappingQuotes(process.env.DATABASE_URL?.trim() ?? '');

  if (!rawUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const normalizedUrl = URL.canParse(rawUrl) ? rawUrl : normalizeDatabaseUrl(rawUrl);
  if (!URL.canParse(normalizedUrl)) {
    throw new TypeError('DATABASE_URL is not a valid PostgreSQL connection string');
  }

  const url = new URL(normalizedUrl);
  const sslMode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');

  const useSsl = !['localhost', '127.0.0.1'].includes(url.hostname) && sslMode !== 'disable';

  return {
    url: url.toString(),
    ssl: useSsl ? 'require' : undefined,
  };
}

const { url, ssl } = getDatabaseConfig();
const sql = postgres(url, {
  ssl,
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 15,
});

try {
  await sql`create extension if not exists vector`;
  await sql`create extension if not exists pgcrypto`;
  console.log('Ensured database extensions: vector, pgcrypto');
} finally {
  await sql.end({ timeout: 5 });
}
