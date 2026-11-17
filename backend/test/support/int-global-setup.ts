import { ensureTestDatabase } from "./test-db";

/** Jest globalSetup for integration tests: create + migrate the test database once per run. */
export default async function globalSetup() {
  const url = await ensureTestDatabase();
  process.env.DATABASE_URL = url;
}
