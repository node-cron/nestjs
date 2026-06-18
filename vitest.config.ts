import { defineConfig } from "vitest/config";

export default defineConfig({
  // Decorator metadata (experimentalDecorators / emitDecoratorMetadata) is
  // picked up from tsconfig.json by the transformer, which Nest's DI needs.
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests (Docker-backed) run via vitest.integration.config.ts.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    setupFiles: ["reflect-metadata"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts"],
    },
  },
});
