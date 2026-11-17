// Unit tests must not touch a database or start background workers.
// The URL is deliberately unusable so an accidental database access fails fast instead of reaching the dev database.
process.env.DATABASE_URL = "postgresql://unit-tests-must-not-use-a-db.invalid:1/none";
process.env.JOBS_WORKER_ENABLED = "false";
process.env.JOBS_SCHEDULER_ENABLED = "false";
process.env.NODE_ENV = "test";
