import { defineConfig } from "vitest/config";

// Docker-backed integration tests (real Redis via testcontainers). Run with
// `npm run test:integration`; excluded from the default `npm test`.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["reflect-metadata"],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
