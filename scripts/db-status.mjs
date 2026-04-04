import { runDbTool } from './_run-db-tool.mjs';

await runDbTool('db-status.mjs', process.argv.slice(2));
