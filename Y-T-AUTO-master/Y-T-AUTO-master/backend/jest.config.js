/** @type {import("ts-jest").JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/setupEnv.ts"],
  clearMocks: true,
  maxWorkers: 1,
};
