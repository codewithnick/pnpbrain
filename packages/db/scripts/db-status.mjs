import path from 'node:path';
import process from 'node:process';
import {
  formatDiffList,
  getRepoRoot,
  inspectDatabase,
  loadRepoMigrationJournal,
} from './_db-introspection.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const envArg = args.find((arg) => !arg.startsWith('--'));

const repoRoot = getRepoRoot();
const envPath = envArg
  ? path.resolve(process.cwd(), envArg)
  : path.join(repoRoot, '.env.local');

const label = path.basename(envPath);
const inspection = await inspectDatabase(label, envPath);
const journal = loadRepoMigrationJournal(repoRoot);

if (asJson) {
  console.log(JSON.stringify({ inspection, journal }, null, 2));
  process.exit(0);
}

console.log(`\n📦 Database status for ${label}`);
console.log(`- Host: ${inspection.host}:${inspection.port || '(default)'}`);
console.log(`- Database: ${inspection.db}`);
console.log(`- Public tables: ${inspection.tableCount}`);
console.log(`- Public columns: ${inspection.columnCount}`);
console.log(`- Drizzle migrations table: ${inspection.migrationSchema ?? 'missing'}`);
console.log(`- Applied migrations in DB: ${inspection.migrationCount ?? 'missing'}`);
console.log(`- Migration files in repo: ${journal?.count ?? 'unknown'}`);
console.log(`- Sample tables: ${formatDiffList(inspection.tableNames, 8).join(', ')}`);
