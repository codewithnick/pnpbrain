import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export async function runDbTool(scriptName, args = []) {
  const scriptPath = path.join(repoRoot, 'packages', 'db', 'scripts', scriptName);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    child.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`DB helper exited via signal ${signal}`));
        return;
      }

      process.exitCode = code ?? 1;
      resolve();
    });
  });
}
