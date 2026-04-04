import { runDbTool } from './_run-db-tool.mjs';

await runDbTool('compare-db-sync.mjs', process.argv.slice(2));
