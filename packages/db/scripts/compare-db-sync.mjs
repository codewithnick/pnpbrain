import path from 'node:path';
import process from 'node:process';
import {
  compareDatabaseInspections,
  formatDiffList,
  getRepoRoot,
  inspectDatabase,
  loadRepoMigrationJournal,
} from './_db-introspection.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const strict = args.includes('--strict');
const positionalArgs = args.filter((arg) => !arg.startsWith('--'));

const repoRoot = getRepoRoot();
const leftPath = positionalArgs[0]
  ? path.resolve(process.cwd(), positionalArgs[0])
  : path.join(repoRoot, '.env.local');
const rightPath = positionalArgs[1]
  ? path.resolve(process.cwd(), positionalArgs[1])
  : path.join(repoRoot, '.env.prod');

const left = await inspectDatabase(path.basename(leftPath), leftPath);
const right = await inspectDatabase(path.basename(rightPath), rightPath);
const comparison = compareDatabaseInspections(left, right);
const journal = loadRepoMigrationJournal(repoRoot);

if (asJson) {
  console.log(JSON.stringify({ left, right, comparison, journal }, null, 2));
  process.exit(comparison.inSync ? 0 : strict ? 1 : 0);
}

console.log('\n🔎 Database sync report');
console.log(`- Left:  ${left.label} → ${left.host}:${left.port || '(default)'}`);
console.log(`- Right: ${right.label} → ${right.host}:${right.port || '(default)'}`);
console.log(`- Repo migration files: ${journal?.count ?? 'unknown'}`);
console.log(`- Left applied migrations: ${left.migrationCount ?? 'missing'} (${left.migrationSchema ?? 'no table'})`);
console.log(`- Right applied migrations: ${right.migrationCount ?? 'missing'} (${right.migrationSchema ?? 'no table'})`);
console.log(`- Tables: ${left.tableCount} vs ${right.tableCount}`);
console.log(`- Columns: ${left.columnCount} vs ${right.columnCount}`);
console.log(`- In sync: ${comparison.inSync ? 'YES' : 'NO'}`);

if (!comparison.inSync) {
  console.log('\n⚠️ Differences');
  console.log(`- Only in ${left.label} tables: ${formatDiffList(comparison.onlyInLeftTables).join(', ')}`);
  console.log(`- Only in ${right.label} tables: ${formatDiffList(comparison.onlyInRightTables).join(', ')}`);
  console.log(`- Sample only in ${left.label} columns: ${formatDiffList(comparison.onlyInLeftColumns, 5).join(', ')}`);
  console.log(`- Sample only in ${right.label} columns: ${formatDiffList(comparison.onlyInRightColumns, 5).join(', ')}`);
}

process.exit(comparison.inSync ? 0 : strict ? 1 : 0);
