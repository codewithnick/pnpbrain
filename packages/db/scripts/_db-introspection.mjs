import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';

const DEFAULT_MIGRATION_SCHEMAS = ['drizzle', 'public'];

export function getRepoRoot(fromDir = process.cwd()) {
  let currentDir = path.resolve(fromDir);

  while (true) {
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(fromDir);
    }

    currentDir = parentDir;
  }
}

export function encodeCredential(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

export function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function normalizeDatabaseUrl(rawUrl) {
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

export function parseEnvFile(filePath) {
  const env = {};
  const fileContents = fs.readFileSync(filePath, 'utf8');

  for (const line of fileContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = stripWrappingQuotes(trimmed.slice(equalsIndex + 1).trim());
    env[key] = value;
  }

  return env;
}

export function resolveDatabaseConfigFromEnvFile(filePath) {
  const env = parseEnvFile(filePath);
  const rawUrl = env['DATABASE_URL']?.trim() ?? '';

  if (!rawUrl) {
    throw new Error(`DATABASE_URL is not set in ${filePath}`);
  }

  const normalizedUrl = URL.canParse(rawUrl) ? rawUrl : normalizeDatabaseUrl(rawUrl);
  if (!URL.canParse(normalizedUrl)) {
    throw new TypeError(`DATABASE_URL in ${filePath} is not a valid PostgreSQL connection string`);
  }

  const url = new URL(normalizedUrl);
  const sslMode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');

  const ssl = !['localhost', '127.0.0.1'].includes(url.hostname) && sslMode !== 'disable'
    ? 'require'
    : undefined;

  return {
    filePath,
    url: url.toString(),
    ssl,
  };
}

export async function inspectDatabase(label, filePath, options = {}) {
  const { migrationSchemas = DEFAULT_MIGRATION_SCHEMAS } = options;
  const { url, ssl } = resolveDatabaseConfigFromEnvFile(filePath);
  const parsedUrl = new URL(url);

  const sql = postgres(url, {
    ssl,
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 15,
  });

  try {
    const [{ currentDatabase }] = await sql`select current_database() as "currentDatabase"`;
    const tables = await sql`
      select table_name as "tableName"
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;
    const columns = await sql`
      select
        table_name as "tableName",
        column_name as "columnName",
        data_type as "dataType",
        udt_name as "udtName",
        is_nullable as "isNullable",
        coalesce(column_default, '') as "columnDefault"
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `;

    let migrationSchema = null;
    let migrationCount = null;

    for (const schemaName of migrationSchemas) {
      try {
        const result = await sql.unsafe(`select count(*)::int as count from ${schemaName}.__drizzle_migrations`);
        migrationSchema = schemaName;
        migrationCount = result[0]?.count ?? 0;
        break;
      } catch {
        // Try the next schema.
      }
    }

    return {
      label,
      filePath,
      host: parsedUrl.hostname,
      port: parsedUrl.port,
      db: currentDatabase,
      tableNames: tables.map((row) => row.tableName),
      columnKeys: columns.map(
        (row) => `${row.tableName}.${row.columnName}|${row.dataType}|${row.udtName}|${row.isNullable}|${row.columnDefault}`,
      ),
      tableCount: tables.length,
      columnCount: columns.length,
      migrationSchema,
      migrationCount,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function compareDatabaseInspections(left, right) {
  const onlyInLeftTables = left.tableNames.filter((name) => !right.tableNames.includes(name));
  const onlyInRightTables = right.tableNames.filter((name) => !left.tableNames.includes(name));
  const onlyInLeftColumns = left.columnKeys.filter((name) => !right.columnKeys.includes(name));
  const onlyInRightColumns = right.columnKeys.filter((name) => !left.columnKeys.includes(name));

  return {
    inSync:
      onlyInLeftTables.length === 0
      && onlyInRightTables.length === 0
      && onlyInLeftColumns.length === 0
      && onlyInRightColumns.length === 0,
    onlyInLeftTables,
    onlyInRightTables,
    onlyInLeftColumns,
    onlyInRightColumns,
  };
}

export function loadRepoMigrationJournal(repoRoot = getRepoRoot()) {
  const journalPath = path.join(repoRoot, 'packages', 'db', 'drizzle', 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

  return {
    path: journalPath,
    count: entries.length,
    tags: entries.map((entry) => entry.tag).filter(Boolean),
  };
}

export function formatDiffList(items, limit = 10) {
  if (items.length === 0) {
    return ['(none)'];
  }

  const visible = items.slice(0, limit);
  if (items.length > limit) {
    visible.push(`... and ${items.length - limit} more`);
  }

  return visible;
}
