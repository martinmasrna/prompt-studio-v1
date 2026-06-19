import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { Database as SQLiteDatabase } from 'node-sqlite3-wasm';

export interface TestServer {
  baseUrl: string;
  db: SQLiteDatabase;
  directory: string;
  configPath: string;
  writeConfig(config: unknown): void;
  close(): Promise<void>;
}

export async function startTestServer(config: unknown = { models: [] }): Promise<TestServer> {
  const directory = mkdtempSync(path.join(tmpdir(), 'prompt-studio-api-'));
  const configPath = path.join(directory, 'config.json');
  writeFileSync(configPath, JSON.stringify(config), 'utf8');
  process.env.PROMPT_STUDIO_DB_PATH = path.join(directory, 'test.db');
  process.env.PROMPT_STUDIO_CONFIG_PATH = configPath;

  const { default: app } = await import('../../src/app');
  const { default: db } = await import('../../src/db');
  const server: Server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    db,
    directory,
    configPath,
    writeConfig(nextConfig) {
      writeFileSync(configPath, JSON.stringify(nextConfig), 'utf8');
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      db.close();
      delete process.env.PROMPT_STUDIO_DB_PATH;
      delete process.env.PROMPT_STUDIO_CONFIG_PATH;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export async function requestJson<T>(
  baseUrl: string,
  pathname: string,
  init?: RequestInit
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body = await response.json() as T;
  return { response, body };
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
