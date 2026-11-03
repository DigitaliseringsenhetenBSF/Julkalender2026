/**
 * Local development: API (node --watch, port API_PORT=3001) + Vite (port 5173, proxies /api).
 * Environment variables such as FAKE_TODAY pass through to the API.
 * Usage: npm run dev   or   FAKE_TODAY=2026-12-10 npm run dev
 */
import { spawn, type ChildProcess } from 'node:child_process';

const apiPort = process.env.API_PORT ?? '3001';
const env = { ...process.env, PORT: apiPort, API_PORT: apiPort };

const children: ChildProcess[] = [
  spawn('npm', ['run', 'dev:api'], { stdio: 'inherit', env }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit', env }),
];

function stop() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    if (code) {
      console.error(`A dev process exited with code ${code}; stopping.`);
      stop();
      process.exitCode = code;
    }
  });
}
