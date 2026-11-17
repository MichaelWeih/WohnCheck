// Unit tests: fast, no database, no network. Files: src/*.spec.ts (NOT *.int-spec.ts).
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src"],
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/", "\\.int-spec\\.ts$"],
  setupFiles: ["<rootDir>/test/support/unit-setup-env.ts"],
  clearMocks: true,
};
