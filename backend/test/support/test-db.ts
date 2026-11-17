import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

/** Minimal .env reader so tests do not depend on a dotenv package. Existing env vars win. */
function loadDotEnv() {
  const file = path.join(BACKEND_ROOT, ".env");

  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);

    if (!match || line.trim().startsWith("#")) continue;

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * URL of the dedicated test database. Derived from DATABASE_URL by appending "_test" (+ TEST_DB_SUFFIX)
 * to the database name, unless TEST_DATABASE_URL is set. Integration tests NEVER run against the dev database.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  loadDotEnv();
  const base = process.env.WOHNCHECK_BASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!base) throw new Error("DATABASE_URL is not set; cannot derive the test database URL.");

  const url = new URL(base);
  const baseName = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (baseName.includes("_test")) return base;

  url.pathname = `/${baseName}_test${process.env.TEST_DB_SUFFIX ?? ""}`;
  return url.toString();
}

function assertTestDatabase(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));

  if (!/^[A-Za-z0-9_]+$/.test(name) || !name.includes("_test")) {
    throw new Error(`Refusing to use "${name}" as test database: the name must contain "_test".`);
  }

  return name;
}

/** Creates the test database if needed and applies all migrations (also proves they apply from scratch). */
export async function ensureTestDatabase(): Promise<string> {
  const url = testDatabaseUrl();
  const name = assertTestDatabase(url);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });

  try {
    const rows = await admin.$queryRawUnsafe<unknown[]>("SELECT 1 FROM pg_database WHERE datname = $1", name);

    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  return url;
}

/** Prisma client bound to the test database. */
export function createTestPrisma(): PrismaClient {
  const url = testDatabaseUrl();
  assertTestDatabase(url);
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Empties every table (except Prisma's migration bookkeeping). Call in beforeEach of integration tests. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const [{ current_database: name }] = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>(
    "SELECT current_database()",
  );

  if (!name.includes("_test")) {
    throw new Error(`Refusing to truncate "${name}": not a test database.`);
  }

  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'",
  );

  if (tables.length === 0) return;

  const list = tables.map((table) => `"${table.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
