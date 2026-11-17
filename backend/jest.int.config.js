// Integration tests against a dedicated PostgreSQL test database (never the dev database).
// Files: src/*.int-spec.ts and test/*.int-spec.ts. Run serially because they share one database.
// Parallel work on one machine: give each run its own database with TEST_DB_SUFFIX, e.g.
// TEST_DB_SUFFIX=_companies npx jest --config jest.int.config.js src/modules/companies
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["<rootDir>/src/**/*.int-spec.ts", "<rootDir>/test/**/*.int-spec.ts"],
  globalSetup: "<rootDir>/test/support/int-global-setup.ts",
  setupFiles: ["<rootDir>/test/support/int-setup-env.ts"],
  maxWorkers: 1,
  testTimeout: 30000,
  clearMocks: true,
};
