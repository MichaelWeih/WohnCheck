import { testDatabaseUrl } from "./test-db";

// Runs in every Jest worker before the test files are loaded:
// point Prisma at the test database and keep background machinery off unless a test starts it explicitly.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.JOBS_WORKER_ENABLED = "false";
process.env.JOBS_SCHEDULER_ENABLED = "false";
process.env.NODE_ENV = "test";
