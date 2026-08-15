import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from '../config';

function resolveMigrationsDir(): string {
  const candidates = [
    join(__dirname, 'migrations'),
    join(__dirname, '..', '..', 'src', 'database', 'migrations'),
    join(process.cwd(), 'src', 'database', 'migrations'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, '001_initial.sql'))) {
      return candidate;
    }
  }
  return candidates[0];
}

export const MIGRATIONS_DIR = resolveMigrationsDir();
const DATABASE_BUSY_TIMEOUT_MS = 5000;
const IN_MEMORY_DATABASE_ERROR =
  'DATABASE_PATH=:memory: is not supported; use a file-backed SQLite database for dedicated analysis connections.';

let dbPromise: Promise<Database> | null = null;
const transactionQueues = new WeakMap<Database, Promise<void>>();
// Queue same-file writers before BEGIN so SQLite busy waits cannot starve the worker pool.
const databaseTransactionQueues = new Map<string, Promise<void>>();
const databaseQueueKeys = new WeakMap<Database, string>();

function assertFileBackedDatabasePath(databasePath: string): void {
  if (databasePath === ':memory:') {
    throw new Error(IN_MEMORY_DATABASE_ERROR);
  }
}

export async function withTransaction<T>(
  db: Database,
  work: () => Promise<T>,
): Promise<T> {
  const databaseQueueKey = databaseQueueKeys.get(db);
  const previous = databaseQueueKey
    ? databaseTransactionQueues.get(databaseQueueKey) ?? Promise.resolve()
    : transactionQueues.get(db) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  if (databaseQueueKey) {
    databaseTransactionQueues.set(databaseQueueKey, tail);
  } else {
    transactionQueues.set(db, tail);
  }

  await previous.catch(() => undefined);
  try {
    await db.exec('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        await db.exec('ROLLBACK');
      } catch {
        // Preserve the transaction failure that caused the rollback attempt.
      }
      throw error;
    }
  } finally {
    release();
    if (databaseQueueKey && databaseTransactionQueues.get(databaseQueueKey) === tail) {
      databaseTransactionQueues.delete(databaseQueueKey);
    } else if (!databaseQueueKey && transactionQueues.get(db) === tail) {
      transactionQueues.delete(db);
    }
  }
}

export async function withReadTransaction<T>(
  db: Database,
  work: () => Promise<T>,
): Promise<T> {
  // Plain BEGIN is deferred, so WAL writers remain unblocked while reads share one snapshot.
  await db.exec('BEGIN');
  try {
    const result = await work();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // Preserve the read or commit failure that caused the rollback attempt.
    }
    throw error;
  }
}

export function discoverMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

export async function openConfiguredDatabase(
  databasePath = config.databasePath,
): Promise<Database> {
  assertFileBackedDatabasePath(databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = await open({
    filename: databasePath,
    driver: sqlite3.Database,
  });
  if (databasePath !== ':memory:') {
    databaseQueueKeys.set(db, resolve(databasePath));
  }
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec(`PRAGMA busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS};`);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function createDatabase(
  databasePath = config.databasePath,
  uploadDir = config.uploadDir,
  migrationsDir = MIGRATIONS_DIR,
): Promise<Database> {
  assertFileBackedDatabasePath(databasePath);
  mkdirSync(uploadDir, { recursive: true });
  const db = await openConfiguredDatabase(databasePath);
  try {
    await db.exec('PRAGMA journal_mode = WAL;');
    await runMigrations(db, migrationsDir);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function runMigrations(db: Database, migrationsDir = MIGRATIONS_DIR): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
  for (const file of discoverMigrationFiles(migrationsDir)) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await withTransaction(db, async () => {
      const applied = await db.get<{ name: string }>(
        'SELECT name FROM migrations WHERE name = ?',
        file,
      );
      if (applied) return;
      await db.exec(sql);
      await db.run('INSERT INTO migrations (name) VALUES (?)', file);
    });
  }
}

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = createDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}
